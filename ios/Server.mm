#import "Server.h"

Server *activeServer;

void onLaunchedCallback() {
  activeServer.signalConsumer(LAUNCHED, nil);
}

extern "C" {
  int lighttpd_launch(
    const char * config_path,
    const char * module_path,
    const char * errlog_path,
    void (*cb)()
  );

  void lighttpd_graceful_shutdown();
}

@implementation Server {
  NSString *configPath;
  NSString *errlogPath;
}

- (id) initWithConfig:(NSString*)configPath
         errlogPath:(NSString*)errlogPath
         signalConsumer:(SignalConsumer)signalConsumer
{
  self = [super init];
  self->configPath = configPath;
  self->errlogPath = errlogPath;
  self.signalConsumer = signalConsumer;
  return self;
}

- (void) cancel {
  NSLog(@"Server.cancel() triggered");
  lighttpd_graceful_shutdown();
  [super cancel];
}

- (void) main {
  NSLog(@"Server.main() triggered");

  if (activeServer) {
    NSString *msg = @"Another Server instance is active";
    NSLog(@"%@", msg);
    self.signalConsumer(CRASHED, msg);
    return;
  }

  @try {
    activeServer = self;
    int res = lighttpd_launch(
      [self->configPath cStringUsingEncoding:NSASCIIStringEncoding],
      nil,
      [self->errlogPath cStringUsingEncoding:NSASCIIStringEncoding],
      onLaunchedCallback
    );
    if (res) [NSException raise:@"Server exited with error" format:@"%d", res];

    activeServer = NULL;

    NSLog(@"Server terminated gracefully");
    self.signalConsumer(TERMINATED, nil);
  }
  @catch (NSException *error) {
    activeServer = NULL;
    NSLog(@"Server crashed %@", error.name);
    self.signalConsumer(CRASHED, error.name);
  }
}

+ (Server*) serverWithConfig:(NSString*)configPath
                  errlogPath:(NSString*)errlogPath
              signalConsumer:(SignalConsumer)signalConsumer
{
  return [[Server alloc]
    initWithConfig: configPath
        errlogPath: errlogPath
    signalConsumer: signalConsumer];
}

@end
