#include "pch.h"
#include "ReactNativeModule.h"
#include <ppltasks.h>

#include <condition_variable>
#include <mutex>

#include "Errors.h"
#include "Server.h"

using namespace std::chrono_literals;
using namespace winrt::ReactNativeStaticServer;
using namespace winrt::Windows::Networking::Connectivity;

double activeServerId;
ReactNativeModule* mod;
React::ReactPromise<::React::JSValue>* pendingResult;
Server *server;

// There is no semaphore in C++ STL prior to C++20,
// thus we have to make it ourselves.
boolean sem = true;
std::mutex sem_guard;
std::condition_variable sem_cv;

void lock_sem() {
  std::unique_lock lk(sem_guard);
  sem_cv.wait(lk, [] { return sem; });
  sem = false;
}

void unlock_sem() {
  std::lock_guard lk(sem_guard);
  if (sem) throw std::exception("Internal synchronization error");
  sem = true;
  sem_cv.notify_one();
}

void OnSignal(std::string signal, std::string details) {
    if (signal == CRASHED || signal == TERMINATED) {
        delete server;
        server = NULL;
    }
    if (pendingResult) {
        if (signal == CRASHED) RNException("Server crashed").reject(*pendingResult);
        else pendingResult->Resolve(NULL);
        delete pendingResult;
        pendingResult = NULL;
        unlock_sem();
    } else mod->sendEvent(signal, details);
}

ReactNativeStaticServerSpec_Constants ReactNativeModule::GetConstants() noexcept {
    ReactNativeStaticServerSpec_Constants res;
    res.CRASHED = CRASHED;
    res.IS_MAC_CATALYST = false;
    res.LAUNCHED = LAUNCHED;
    res.TERMINATED = TERMINATED;
    return res;
}

void ReactNativeModule::getLocalIpAddress(React::ReactPromise<React::JSValue>&& result) noexcept {
    try {
        auto hosts = NetworkInformation::GetHostNames();
        for (winrt::Windows::Networking::HostName host: hosts) {
            if (host.Type() == winrt::Windows::Networking::HostNameType::Ipv4) {
                auto network = host.IPInformation().NetworkAdapter();
                int32_t netType = network.IanaInterfaceType();
                // TODO: This needs second thoughts, and a lot of testing.
                // The current values 6 & 72 mean "either Ethernet network,
                // or IEEE 802.11 wireless network interface", see:
                // https://learn.microsoft.com/en-us/uwp/api/windows.networking.connectivity.networkadapter.ianainterfacetype?view=winrt-22621#property-value
                // For now we just pick up the first IP for such connected
                // network, but we probably should give library consumer
                // control over what network is selected, and stuff (there
                // are related tickets for other os).
                if (netType == 6 || netType == 71) {
                    // TODO: Here we can use network.GetConnectedProfileAsync()
                    // to get more info about the current connection status,
                    // but for now just let return the first IP we found.
                    return result.Resolve(winrt::to_string(host.CanonicalName()));
                }
            }
        }
    }
    catch (...) {
        // NOOP
    }
    RNException("Failed to get a non-local IP address").reject(result);
}

void ReactNativeModule::getOpenPort(
    std::string address,
    React::ReactPromise<React::JSValue>&& result
) noexcept {
    try {
        auto socket = winrt::Windows::Networking::Sockets::StreamSocketListener();
        // TODO: This will fail if nor InternetClientServer neither PrivateNetworkClientServer
        // capability is granted to the app. The error messaging should be improved, to make it
        // clear to the library consumer why the failure happened.
        winrt::Windows::Networking::HostName hostname(winrt::to_hstring(address));
        if (socket.BindEndpointAsync(hostname, L"").wait_for(5s) != AsyncStatus::Completed) {
            return RNException("Binding time out").reject(result);
        }
        double port = std::stod(winrt::to_string(socket.Information().LocalPort()));
        socket.Close();
        return result.Resolve(port);
    }
    catch (...) {
        // NOOP
    }
    RNException("Failed to get an open port").reject(result);
}

void ReactNativeModule::sendEvent(std::string signal, std::string details) {
    JSValueObject obj = JSValueObject{
            {"serverId", activeServerId},
            {"event", signal},
            {"details", details}
    };
    this->EmitEvent(std::move(obj));
}

void ReactNativeModule::start(
    double id,
    std::string configPath,
    std::string errlogPath,
    React::ReactPromise<::React::JSValue>&& result
) noexcept {
    lock_sem();

    if (server) {
      RNException("Another server instance is active").reject(result);
      unlock_sem();
      return;
    };

    if (pendingResult) {
      RNException("Internal error").reject(result);
      unlock_sem();
      return;
    }

    mod = this;
    activeServerId = id;
    pendingResult = new React::ReactPromise<React::JSValue>(result);
    server = new Server(configPath, errlogPath, OnSignal);
    server->launch();
}

void ReactNativeModule::stop(React::ReactPromise<React::JSValue>&& result) noexcept {
    try {
        lock_sem();

        // The synchronization in JS layer is supposed to ensure this native
        // .stop() is never called before any previous pendingResult is settled
        // and cleaned up.
        if (pendingResult) {
          unlock_sem();
          RNException("Internal error").reject(result);
          return;
        }

        // This means either the server has crashed at the same time we were
        // about to ask it to gracefully shutdown, or there is some error in
        // JS layer, which is not supposed to call this native .stop() unless
        // an active server instance exists.
        if (!server) {
          RNException("No active server").reject(result);
          unlock_sem();
          return;
        }

        pendingResult = new React::ReactPromise<React::JSValue>(result);
        server->shutdown();

        // The OnSignal() handler will dispose the server once TERMINATED,
        // or CRASHED signal is received, and it will settle and clean up
        // pendingPromise; anything else going wrong, the try/catch block
        // will catch it and report to JS layer in RN way.
    }
    catch (...) {
        RNException("Failed to gracefully shutdown the server").reject(result);
    }
}
