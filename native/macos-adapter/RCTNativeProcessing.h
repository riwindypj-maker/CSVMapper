// NativeProcessing TurboModule の Objective-C インターフェース。
// React Native から inspectInput / preview / cancel を呼ぶために存在する。
// RELEVANT FILES: RCTNativeProcessing.mm, MacOSFileSystemAdapter.mm

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCTNativeProcessing : RCTEventEmitter <RCTBridgeModule>
@end
