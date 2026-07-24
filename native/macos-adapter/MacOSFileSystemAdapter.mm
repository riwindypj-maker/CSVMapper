// macOS の FileSystemPort 実装とファイル選択。
// Processing Core へ ByteSource を渡し、NSOpenPanel で入力 CSV を選ぶために存在する。
// RELEVANT FILES: MacOSFileSystemAdapter.h, RCTNativeProcessing.mm

#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

#include "MacOSFileSystemAdapter.h"

#include <string>

namespace csvmapper {

std::unique_ptr<ByteSource> MacOSFileSystemAdapter::OpenRead(const FileIdentity &file, std::error_code &ec) {
  ec.clear();
  auto source = std::make_unique<FileByteSource>(file.path);
  if (!source->IsOpen()) {
    ec = std::make_error_code(std::errc::no_such_file_or_directory);
    return nullptr;
  }
  // 選択後に置き換えられた入力を検出する（サイズ不一致）。
  if (file.size != 0 && source->Size() != file.size) {
    ec = std::make_error_code(std::errc::invalid_argument);
    return nullptr;
  }
  return source;
}

FileIdentity FileIdentityFromPath(const std::string &path) {
  FileIdentity identity;
  identity.path = path;
  NSString *nsPath = [NSString stringWithUTF8String:path.c_str()];
  NSDictionary *attrs = [[NSFileManager defaultManager] attributesOfItemAtPath:nsPath error:nil];
  if (attrs) {
    identity.size = [attrs fileSize];
    NSDate *mod = attrs[NSFileModificationDate];
    if (mod) {
      identity.modifiedTimeMs = static_cast<std::int64_t>([mod timeIntervalSince1970] * 1000.0);
    }
  }
  return identity;
}

} // namespace csvmapper

@interface MacOSFilePicker : NSObject
+ (void)pickCsvWithCompletion:(void (^)(NSDictionary *_Nullable file, BOOL cancelled))completion;
@end

@implementation MacOSFilePicker

+ (void)pickCsvWithCompletion:(void (^)(NSDictionary *_Nullable file, BOOL cancelled))completion {
  dispatch_async(dispatch_get_main_queue(), ^{
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.allowsMultipleSelection = NO;
    panel.allowedFileTypes = @[ @"csv", @"txt", @"text" ];
    panel.title = @"入力 CSV を選択";
    [panel beginWithCompletionHandler:^(NSModalResponse result) {
      if (result != NSModalResponseOK || panel.URLs.count == 0) {
        completion(nil, YES);
        return;
      }
      NSURL *url = panel.URLs.firstObject;
      std::string path = url.path.UTF8String ?: "";
      auto identity = csvmapper::FileIdentityFromPath(path);
      completion(
          @{
            @"path" : url.path ?: @"",
            @"osFileId" : @"",
            @"size" : @(identity.size),
            @"modifiedTimeMs" : @(identity.modifiedTimeMs),
          },
          NO);
    }];
  });
}

@end
