#import "Errors.h"

static NSString * const ERROR_DOMAIN = @"RNStaticServer";

@implementation RNException;

- (id) initWithName:(NSString*)name details:(NSString*)details
{
  self = [super initWithName:name reason:details userInfo:nil];
  return self;
}

/**
 * Creates a new NSError object based on this RNException
 */
- (NSError*) error
{
  return [NSError
          errorWithDomain: ERROR_DOMAIN
          code: self.code
          userInfo: self.userInfo
  ];
}

- (RNException*) log
{
  NSLog(@"%@: %@", self.name, self.reason);
  return self;
}

- (void) reject: (RCTPromiseRejectBlock)reject
{
  reject(self.name, self.reason, [self error]);
}

+ (RNException*) from: (NSException*)exception
{
  return [[RNException alloc]
          initWithName: exception.name
          reason: exception.reason
          userInfo: exception.userInfo
  ];
}

+ (RNException*) name: (NSString*)name
{
  return [[RNException alloc] initWithName:name details:nil];
}

+ (RNException*) name: (NSString*)name details:(NSString*)details
{
  return [[RNException alloc] initWithName:name details:details];
}

@end;
