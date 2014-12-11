var assert = require('assert');

export default class ExclusiveStreamReader {
  constructor(stream) {
    ensureIsRealStream(stream);

    if (stream._reader !== undefined) {
      throw new TypeError('This stream has already been locked for exclusive reading by another reader');
    }

    stream._reader = this;

    this._stream = stream;

    this._lockReleased = new Promise(resolve => {
      this._lockReleased_resolve = resolve;
    });
  }

  get ready() {
    if (this._stream === undefined) {
      return Promise.reject(isNotLockedError());
    }
    assertStreamReaderRelationshipIsCorrect(this);

    this._stream._reader = undefined;
    try {
      return this._stream.ready;
    } finally {
      this._stream._reader = this;
    }
  }

  get state() {
    ensureStreamReaderIsExclusive(this);

    this._stream._reader = undefined;
    try {
      return this._stream.state;
    } finally {
      this._stream._reader = this;
    }
  }

  get closed() {
    if (this._stream === undefined) {
      return Promise.reject(isNotLockedError());
    }
    assertStreamReaderRelationshipIsCorrect(this);

    this._stream._reader = undefined;
    try {
      return this._stream.closed;
    } finally {
      this._stream._reader = this;
    }
  }

  get isActive() {
    return this._stream !== undefined;
  }

  read(...args) {
    ensureStreamReaderIsExclusive(this);

    this._stream._reader = undefined;
    try {
      return this._stream.read(...args);
    } finally {
      this._stream._reader = this;
    }
  }

  cancel(reason, ...args) {
    if (this._stream === undefined) {
      return Promise.reject(isNotLockedError());
    }
    assertStreamReaderRelationshipIsCorrect(this);

    var stream = this._stream;
    this.releaseLock();
    return stream.cancel(reason, ...args);
  }

  releaseLock() {
    if (this._stream === undefined) {
      return;
    }

    this._stream._reader = undefined;
    this._stream = undefined;
    this._lockReleased_resolve(undefined);
  }
}

// These do not appear in the spec (thus the lower-case names), since they're one-liners in spec text anyway, but we
// factor them out into helper functions in the reference implementation just for brevity's sake, and to emphasize that
// the error message is the same in all places they're called, and to give us the opportunity to add an assert.

function assertStreamReaderRelationshipIsCorrect(reader) {
  assert(reader._stream._reader === reader,
    'If the reader has a [[stream]] then the stream\'s [[reader]] must be this reader');
}

function ensureStreamReaderIsExclusive(reader) {
  if (reader._stream === undefined) {
    throw isNotLockedError();
  }

  assertStreamReaderRelationshipIsCorrect(reader);
}

function ensureIsRealStream(stream) {
  if (!('_reader' in stream)) {
    throw new TypeError('ExclusiveStreamReader can only be used with ReadableStream objects or subclasses');
  }
}

function isNotLockedError() {
  return new TypeError('This stream reader has released its lock on the stream and can no longer be used');
}
