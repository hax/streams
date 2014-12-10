var assert = require('assert');

export default class ExclusiveStreamReader {
  constructor(stream, { getReader, setReader }) {
    if (typeof getReader !== 'function') {
      throw new TypeError('lock must be a function');
    }

    if (typeof setReader !== 'function') {
      throw new TypeError('unlock must be a function');
    }

    if (getReader(stream) !== undefined) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    setReader(stream, this);

    this._stream = stream;
    this._getReader = getReader;
    this._setReader = setReader;

    this._lockReleased = new Promise(resolve => {
      this._lockReleased_resolve = resolve;
    });
  }

  get ready() {
    EnsureStreamReaderIsExclusive(this);

    this._setReader(this._stream, undefined);
    try {
      return this._stream.ready;
    } finally {
      this._setReader(this._stream, this);
    }
  }

  get state() {
    EnsureStreamReaderIsExclusive(this);

    this._setReader(this._stream, undefined);
    try {
      return this._stream.state;
    } finally {
      this._setReader(this._stream, this);
    }
  }

  get closed() {
    EnsureStreamReaderIsExclusive(this);

    return this._stream.closed;
  }

  get isActive() {
    return this._stream !== undefined;
  }

  read(...args) {
    EnsureStreamReaderIsExclusive(this);

    this._setReader(this._stream, undefined);
    try {
      return this._stream.read(...args);
    } finally {
      this._setReader(this._stream, this);
    }
  }

  cancel(reason, ...args) {
    EnsureStreamReaderIsExclusive(this);

    var stream = this._stream;
    this.releaseLock();
    return stream.cancel(reason, ...args);
  }

  releaseLock() {
    this._setReader(this._stream, undefined);
    this._stream = undefined;
    this._lockReleased_resolve(undefined);
  }
}

function EnsureStreamReaderIsExclusive(reader) {
  if (reader._getReader(reader._stream) !== reader) {
    throw new TypeError('This stream reader has released its lock on the stream and can no longer be used');
  }
}
