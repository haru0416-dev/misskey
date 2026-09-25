use std::io::{Cursor, Read};

use napi::bindgen_prelude::*;
use zip::result::ZipError;

/// アップロードされた zip から、名前を指定した通常ファイルだけをメモリへ読む。
/// ディスクへは展開しない。エントリ名に含まれるパスや symlink を辿る余地を残さないため。
#[napi(js_name = "ZipArchiveReader")]
pub struct ZipArchiveReader {
  archive: zip::ZipArchive<Cursor<Vec<u8>>>,
}

#[napi]
impl ZipArchiveReader {
  #[napi(factory)]
  pub fn from_buffer(buffer: Buffer) -> Result<Self> {
    let archive = zip::ZipArchive::new(Cursor::new(buffer.to_vec())).map_err(|err| {
      Error::new(
        Status::InvalidArg,
        format!("Failed to open zip archive: {}", err),
      )
    })?;
    Ok(Self { archive })
  }

  /// `name` と完全一致するエントリの中身を返す。無ければ null。
  /// ディレクトリ・symlink・暗号化されたエントリと、展開後に `max_bytes` を超えるエントリはエラーにする。
  /// 宣言サイズは偽れるので、実際に読んだバイト数でも上限を確かめる。
  #[napi]
  pub fn read_file(&mut self, name: String, max_bytes: u32) -> Result<Option<Buffer>> {
    let mut file = match self.archive.by_name(&name) {
      Ok(file) => file,
      Err(ZipError::FileNotFound) => return Ok(None),
      Err(err) => {
        return Err(Error::new(
          Status::InvalidArg,
          format!("Failed to read zip entry {}: {}", name, err),
        ))
      }
    };
    if file.encrypted() {
      return Err(Error::new(
        Status::InvalidArg,
        format!("Encrypted zip entry is not allowed: {}", name),
      ));
    }
    if !file.is_file() {
      return Err(Error::new(
        Status::InvalidArg,
        format!("Zip entry is not a regular file: {}", name),
      ));
    }
    let limit = u64::from(max_bytes);
    if file.size() > limit {
      return Err(Error::new(
        Status::InvalidArg,
        format!("Zip entry is too large: {}", name),
      ));
    }
    let mut data = Vec::with_capacity(file.size() as usize);
    (&mut file)
      .take(limit + 1)
      .read_to_end(&mut data)
      .map_err(|err| {
        Error::new(
          Status::InvalidArg,
          format!("Failed to read zip entry {}: {}", name, err),
        )
      })?;
    if data.len() as u64 > limit {
      return Err(Error::new(
        Status::InvalidArg,
        format!("Zip entry is too large: {}", name),
      ));
    }
    Ok(Some(data.into()))
  }
}
