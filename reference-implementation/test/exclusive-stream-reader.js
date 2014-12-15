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

test('Readers delegate to underlying stream implementations', t => {
  t.plan(3 * 3 + 2 * 4);

  var rs = new ReadableStream();
  var reader = rs.getReader();

  testGetter('ready');
  testGetter('state');
  testGetter('closed');
  testMethod('read');
  testMethod('cancel');

  // Generates 4 assertions
  function testGetter(propertyName) {
    Object.defineProperty(rs, propertyName, {
      get() {
        t.pass('overriden ' + propertyName + ' called');
        t.equal(this, rs, propertyName + ' called with the correct this value');
        return propertyName + ' return value';
      }
    });
    t.equal(reader[propertyName], propertyName + ' return value',
      `reader's ${propertyName} returns the return value of the stream's ${propertyName}`);
  }

  // Generates 5 assertions
  function testMethod(methodName) {
    var testArgs = ['arg1', 'arg2', 'arg3'];
    rs[methodName] = function (...args) {
      t.pass('overridden ' + methodName + ' called');
      t.deepEqual(args, testArgs, methodName + ' called with the correct arguments');
      t.equal(this, rs, methodName + ' called with the correct this value');
      return methodName + ' return value';
    }
    t.equal(reader[methodName](...testArgs), methodName + ' return value',
      `reader's ${methodName} returns the return value of the stream's ${methodName}`);
  }
});

test('Reading from a reader for an empty stream throws but doesn\'t break anything', t => {
  var enqueue;
  var rs = new ReadableStream({
    start(e) {
      enqueue = e;
    }
  });
  var reader = rs.getReader();

  t.equal(reader.isActive, true, 'reader is active to start with');
  t.equal(reader.state, 'waiting', 'reader state is waiting to start with');
  t.throws(() => reader.read(), /TypeError/, 'calling reader.read() throws a TypeError');
  t.equal(reader.isActive, true, 'reader is still active');
  t.equal(reader.state, 'waiting', 'reader state is still waiting');

  enqueue('a');

  reader.ready.then(() => {
    t.equal(reader.state, 'readable', 'after enqueuing the reader state is readable');
    t.equal(reader.read(), 'a', 'the enqueued chunk can be read back through the reader');
    t.end();
  });
});

test('Trying to use a released reader should fail', t => {
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

test('getReader() on a closed stream should fail', t => {
  var rs = new ReadableStream({
    start(enqueue, close) {
      close();
    }
  });

  t.equal(rs.state, 'closed', 'the stream should be closed');
  t.throws(() => rs.getReader(), /TypeError/, 'getReader() threw a TypeError');
  t.end();
});

test('getReader() on a cancelled stream should fail (since cancelling closes)', t => {
  var rs = new ReadableStream();
  rs.cancel(new Error('fun time is over'));

  t.equal(rs.state, 'closed', 'the stream should be closed');
  t.throws(() => rs.getReader(), /TypeError/, 'getReader() threw a TypeError');
  t.end();
});

test('getReader() on an errored stream should rethrow the error', t => {
  var theError = new Error('don\'t say i didn\'t warn ya');
  var rs = new ReadableStream({
    start(enqueue, close, error) {
      error(theError);
    }
  });

  t.equal(rs.state, 'errored', 'the stream should be errored');
  t.throws(() => rs.getReader(), /don't say i didn't warn ya/, 'getReader() threw the error');
  t.end();
});

// TODO: test that you can read(), get reader and read() from it, release, read() from stream, get another reader and
// read() from it, release, read() from stream.

// TODO: test streams that error
