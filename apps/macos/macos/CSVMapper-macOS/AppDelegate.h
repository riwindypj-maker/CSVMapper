// macOS アプリケーションと React Native Factory のライフサイクル境界を定義する。
// 非推奨の RCTAppDelegate を使わず、現行 Factory API でホストを起動するために存在する。
// RELEVANT FILES: AppDelegate.mm, ../CSVMapper.xcodeproj/project.pbxproj, ../../../../native/processing-core/include/csvmapper/processing_core.h

#import <Cocoa/Cocoa.h>
#import <RCTDefaultReactNativeFactoryDelegate.h>

@class RCTReactNativeFactory;

@interface AppDelegate : RCTDefaultReactNativeFactoryDelegate <NSApplicationDelegate>

@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) RCTReactNativeFactory *reactNativeFactory;

@end
