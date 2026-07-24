// macOS の React Native アプリケーション起動処理を構成する。
// JavaScriptホストと共有 Processing Core / NativeProcessing のリンク境界を初期化するために存在する。
// RELEVANT FILES: AppDelegate.h, ../../../../native/processing-core/include/csvmapper/processing_core.h, ../../../../native/macos-adapter/RCTNativeProcessing.h

#import "AppDelegate.h"

#import <RCTReactNativeFactory.h>
#import <React/RCTBundleURLProvider.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

#include <csvmapper/processing_core.h>

// RCTNativeProcessing は RCT_EXPORT_MODULE で自動登録される。
#import "RCTNativeProcessing.h"

static NSString *const CSVMapperWindowFrameAutosaveName = @"CSVMapperMainWindow";

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  self.dependencyProvider = [RCTAppDependencyProvider new];
  self.reactNativeFactory = [[RCTReactNativeFactory alloc] initWithDelegate:self];

  self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 1280, 720)
                                            styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskResizable |
                                                      NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable
                                              backing:NSBackingStoreBuffered
                                                defer:NO];
  self.window.title = @"CSVMapper";
  self.window.autorecalculatesKeyViewLoop = YES;

  [self.reactNativeFactory startReactNativeWithModuleName:@"CSVMapper"
                                                 inWindow:self.window
                                        initialProperties:@{}
                                            launchOptions:notification.userInfo];

  if (![self.window setFrameUsingName:CSVMapperWindowFrameAutosaveName]) {
    [self.window center];
  }
  [self.window setFrameAutosaveName:CSVMapperWindowFrameAutosaveName];

  NSLog(@"CSVMapper Processing Core: %s", csvmapper::processing_core_version());
  NSLog(@"CSVMapper NativeProcessing module registered");
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge {
  return [self bundleURL];
}

- (NSURL *)bundleURL {
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
