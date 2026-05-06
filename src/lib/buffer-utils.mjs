export function readFixedNullTerminatedAscii(buffer, offset, length) {
  const end = Math.min(offset + length, buffer.length);
  let cursor = offset;

  while (cursor < end && buffer[cursor] !== 0) {
    cursor += 1;
  }

  return buffer.toString('ascii', offset, cursor);
}

export function readNullTerminatedAscii(buffer, offset, maxLength = 256) {
  const end = Math.min(buffer.length, offset + maxLength);
  let cursor = offset;

  while (cursor < end && buffer[cursor] !== 0) {
    cursor += 1;
  }

  return {
    value: buffer.toString('ascii', offset, cursor),
    nextOffset: cursor < buffer.length ? cursor + 1 : cursor
  };
}

export function findAscii(buffer, value, start = 0) {
  return buffer.indexOf(Buffer.from(value, 'ascii'), start);
}

export function isPrintableAscii(value) {
  return /^[\x20-\x7E]+$/.test(value);
}
