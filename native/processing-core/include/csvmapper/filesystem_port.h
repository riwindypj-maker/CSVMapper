// ファイル実体アクセスの抽象契約を定義する。
// Processing Core が OS API を直接呼ばず Platform Adapter 経由で読むために存在する。
// RELEVANT FILES: csv_inspect.h, preview.h, ../../macos-adapter/MacOSFileSystemAdapter.mm

#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <system_error>

#include "csvmapper/csv_inspect.h"

namespace csvmapper {

// 入力・出力ファイルの識別情報。選択直後の照合に使う。
struct FileIdentity {
  std::string path;
  std::string osFileId;
  std::uint64_t size = 0;
  std::int64_t modifiedTimeMs = 0;
};

// Processing Core が所有するファイル操作の抽象。置換 API は順序 7 で拡張する。
class FileSystemPort {
public:
  virtual ~FileSystemPort() = default;

  // 読込用 ByteSource を開く。失敗時は nullptr と ec を返す。
  virtual std::unique_ptr<ByteSource> OpenRead(const FileIdentity &file, std::error_code &ec) = 0;
};

// 標準ファイル I/O による ByteSource。アダプターとテストで共有する。
class FileByteSource final : public ByteSource {
public:
  explicit FileByteSource(std::string path);
  ~FileByteSource() override;

  // 開けなかった場合は Size()==0 かつ Read が常に 0。isOpen() で確認する。
  bool IsOpen() const;
  std::uint64_t Size() const override;
  bool Rewind() override;
  std::size_t Read(char *buffer, std::size_t maxBytes) override;

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace csvmapper
