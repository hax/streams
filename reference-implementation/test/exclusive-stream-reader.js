var test = require('tape');

import ReadableStream from '../lib/readable-stream';

test('Using the reader directly on a mundane stream', t => {
  t.plan(21);

  var rs = new ReadableStream({
    start(enqueue, close) {
      enqueue('a');
      setTimeout(() => enqueue('b'), 30);
      setTimeout(close, 60);
    }
  });

  t.equal(rs.state, 'readable', 'stream starts out readable');

  var reader = rs.getReader();

  t.equal(reader.isActive, true, 'reader isActive is true');

  t.equal(rs.state, 'waiting', 'after getting a reader, the stream state is waiting');
  t.equal(reader.state, 'readable', 'the reader state is readable');

  t.throws(() => rs.read(), /TypeError/, 'trying to read from the stream directly throws a TypeError');
  t.equal(reader.read(), 'a', 'trying to read from the reader works and gives back the first enqueued value');
  t.equal(reader.state, 'waiting', 'the reader state is now waiting since the queue has been drained');
  rs.cancel().then(
    () => t.fail('cancel() should not be fulfilled'),
    e => t.equal(e.constructor, TypeError, 'cancel() should be rejected with a TypeError')
  );

  reader.ready.then(() => {
    t.equal(reader.state, 'readable', 'ready for reader is fulfilled when second chunk is enqueued');
    t.equal(rs.state, 'waiting', 'the stream state is still waiting');
    t.equal(reader.read(), 'b', 'you can read the second chunk from the reader');
  });

  reader.closed.then(() => {
    t.pass('closed for the reader is fulfilled');
    t.equal(reader.state, 'closed', 'the reader state is closed');
    t.equal(rs.state, 'waiting', 'the stream state is still waiting');
    t.equal(reader.isActive, true, 'the reader is still active');

    reader.releaseLock();

    t.equal(reader.isActive, false, 'the reader is no longer active');
    t.equal(rs.state, 'closed', 'the stream state is now closed');
  });

  rs.ready.then(() => {
    t.equal(rs.state, 'closed', 'ready for stream is not fulfilled until the stream closes');
    t.equal(reader.isActive, false, 'the reader is no longer active after the stream has closed');
  });

  rs.closed.then(() => {
    t.pass('closed for the stream is fulfilled');
    t.equal(rs.state, 'closed', 'the stream state is closed');
  });
});

test('Trying to use a released reader', t => {
  t.plan(6);

  var rs = new ReadableStream({
    start(enqueue) {
      enqueue('a');
      enqueue('b');
    }
  });
  var reader = rs.getReader();
  reader.releaseLock();

  t.equal(reader.isActive, false, 'isActive returns false');
  t.throws(() => reader.state, /TypeError/, 'trying to get reader.state gives a TypeError');
  t.throws(() => reader.read(), /TypeError/, 'trying to read gives a TypeError');

  reader.ready.then(
    () => t.fail('ready should not be fulfilled'),
    e => t.equal(e.constructor, TypeError, 'ready should be rejected with a TypeError')
  );

  reader.closed.then(
    () => t.fail('closed should not be fulfilled'),
    e => t.equal(e.constructor, TypeError, 'closed should be rejected with a TypeError')
  );

  reader.cancel().then(
    () => t.fail('cancel() should not be fulfilled'),
    e => t.equal(e.constructor, TypeError, 'cancel() should be rejected with a TypeError')
  );
});

test('cancel() on a reader implicitly releases the reader before calling through', t => {
  t.plan(3);

  var passedReason = new Error('it wasn\'t the right time, sorry');
  var rs = new ReadableStream({
    cancel(reason) {
      t.equal(reason, passedReason, 'the cancellation reason is passed through to the underlying source');
    }
  });

  var reader = rs.getReader();
  reader.cancel(passedReason).then(
    () => t.pass('reader.cancel() should fulfill'),
    e => t.fail('reader.cancel() should not reject')
  );

  t.equal(reader.isActive, false, 'canceling via the reader should release the reader\'s lock');
});

test('cancel() on a reader calls this.releaseLock directly instead of cheating', t => {
  t.plan(3);

  var rs = new ReadableStream();

  var reader = rs.getReader();
  reader.releaseLock = function (...args) {
    t.pass('releaseLock was called directly');
    t.equal(args.length, 0, 'no arguments were passed');
    t.equal(this, reader, 'the correct this value was passed');
  };

  reader.cancel();
});
