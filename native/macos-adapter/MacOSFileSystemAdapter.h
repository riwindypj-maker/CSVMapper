// macOS FileSystemPort とファイル選択の宣言。
// TurboModule から Core へバイト供給するために存在する。
// RELEVANT FILES: MacOSFileSystemAdapter.mm, RCTNativeProcessing.mm

#pragma once

#include <memory>
#include <system_error>

#include "csvmapper/filesystem_port.h"

namespace csvmapper {

class MacOSFileSystemAdapter final : public FileSystemPort {
public:
  std::unique_ptr<ByteSource> OpenRead(const FileIdentity &file, std::error_code &ec) override;
};

FileIdentity FileIdentityFromPath(const std::string &path);

} // namespace csvmapper
