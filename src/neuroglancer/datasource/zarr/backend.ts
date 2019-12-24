/**
 * @license
 * Copyright 2019 Google Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {decodeGzip} from 'neuroglancer/async_computation/decode_gzip_request';
import {requestAsyncComputation} from 'neuroglancer/async_computation/request';
import {WithParameters} from 'neuroglancer/chunk_manager/backend';
import {VolumeChunkEncoding, VolumeChunkSourceParameters} from 'neuroglancer/datasource/zarr/base';
import {decodeRawChunk} from 'neuroglancer/sliceview/backend_chunk_decoders/raw';
import {VolumeChunk, VolumeChunkSource} from 'neuroglancer/sliceview/volume/backend';
import {CancellationToken} from 'neuroglancer/util/cancellation';
import {Endianness} from 'neuroglancer/util/endian';
import {cancellableFetchOk, responseArrayBuffer} from 'neuroglancer/util/http_request';
import {registerSharedObject} from 'neuroglancer/worker_rpc';

async function decodeChunk(
    chunk: VolumeChunk, cancellationToken: CancellationToken, response: ArrayBuffer,
    encoding: VolumeChunkEncoding) {
  let buffer = new Uint8Array(response);
  if (encoding === VolumeChunkEncoding.GZIP) {
    buffer = await requestAsyncComputation(decodeGzip, cancellationToken, [buffer.buffer], buffer);
  }
  await decodeRawChunk(
      chunk, cancellationToken, buffer.buffer, Endianness.BIG, buffer.byteOffset,
      buffer.byteLength);
}


@registerSharedObject() export class PrecomputedVolumeChunkSource extends
(WithParameters(VolumeChunkSource, VolumeChunkSourceParameters)) {
  async download(chunk: VolumeChunk, cancellationToken: CancellationToken) {
    const {parameters} = this;
    chunk.chunkDataSize = parameters.chunkSize;

    const {chunkGridPosition} = chunk;
    const chunkPath = chunkGridPosition.slice().reverse().join('.');
    const url = `${parameters.url}/${chunkPath}`;
    const response = await cancellableFetchOk(url, {}, responseArrayBuffer, cancellationToken);
    await decodeChunk(chunk, cancellationToken, response, parameters.encoding);
  }
}
