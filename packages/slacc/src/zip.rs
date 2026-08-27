use std::{
  io::Cursor,
  path::{Path, PathBuf},
};

use napi::bindgen_prelude::*;

#[napi(js_name = "ZipReader")]
pub struct ZipReader {
  destination: Box<Path>,
}

#[napi]
impl ZipReader {
  #[napi(factory)]
  pub fn with_destination_path(path: String) -> Self {
    Self {
      destination: PathBuf::from(&path).into_boxed_path(),
    }
  }

  #[napi]
  pub fn via_buffer(&self, buffer: Buffer) -> Result<()> {
    let mut archive = zip::ZipArchive::new(Cursor::new(buffer.as_ref())).map_err(|err| {
      Error::new(
        Status::InvalidArg,
        format!("Failed to open zip archive: {}", err),
      )
    })?;

    archive.extract(&self.destination).map_err(|err| {
      Error::new(
        Status::InvalidArg,
        format!("Failed to extract zip archive: {}", err),
      )
    })
  }
}
