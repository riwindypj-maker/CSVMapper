// FileByteSource の実装。
// OS 非依存のファイル読込を ByteSource として提供するために存在する。
// RELEVANT FILES: ../include/csvmapper/filesystem_port.h, csv_inspect.cpp, preview.cpp

#include "csvmapper/filesystem_port.h"

#include <cstdio>
#include <utility>

namespace csvmapper {

struct FileByteSource::Impl {
  std::string path;
  FILE *fp = nullptr;
  std::uint64_t size = 0;
};

FileByteSource::FileByteSource(std::string path) : impl_(std::make_unique<Impl>()) {
  impl_->path = std::move(path);
  impl_->fp = std::fopen(impl_->path.c_str(), "rb");
  if (!impl_->fp)
    return;
  if (std::fseek(impl_->fp, 0, SEEK_END) != 0) {
    std::fclose(impl_->fp);
    impl_->fp = nullptr;
    return;
  }
  const long end = std::ftell(impl_->fp);
  if (end < 0) {
    std::fclose(impl_->fp);
    impl_->fp = nullptr;
    return;
  }
  impl_->size = static_cast<std::uint64_t>(end);
  if (std::fseek(impl_->fp, 0, SEEK_SET) != 0) {
    std::fclose(impl_->fp);
    impl_->fp = nullptr;
    impl_->size = 0;
  }
}

FileByteSource::~FileByteSource() {
  if (impl_ && impl_->fp) {
    std::fclose(impl_->fp);
    impl_->fp = nullptr;
  }
}

bool FileByteSource::IsOpen() const { return impl_ && impl_->fp != nullptr; }

std::uint64_t FileByteSource::Size() const { return impl_ ? impl_->size : 0; }

bool FileByteSource::Rewind() {
  if (!impl_ || !impl_->fp)
    return false;
  return std::fseek(impl_->fp, 0, SEEK_SET) == 0;
}

std::size_t FileByteSource::Read(char *buffer, std::size_t maxBytes) {
  if (!impl_ || !impl_->fp || buffer == nullptr || maxBytes == 0)
    return 0;
  return std::fread(buffer, 1, maxBytes, impl_->fp);
}

} // namespace csvmapper
