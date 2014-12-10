var test = require('tape');

import ReadableStream from '../lib/readable-stream';

test('Using the reader directly on a mundane stream', t => {
  t.plan(16);

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

  rs.ready.then(() => {
    t.equal(rs.state, 'closed', 'ready for stream is not fulfilled until the stream closes');
    t.equal(reader.isActive, false, 'the reader is no longer active after the stream has closed');
  });

  reader.ready.then(() => {
    t.equal(reader.state, 'readable', 'ready for reader is fulfilled when second chunk is enqueued');
    t.equal(rs.state, 'waiting', 'the stream state is still waiting');
    t.equal(reader.read(), 'b', 'you can read the second chunk from the reader');
  });

  rs.closed.then(() => {
    t.pass('closed for the stream is fulfilled');
    t.equal(rs.state, 'closed', 'the stream state is closed');
  });

  reader.closed.then(() => {
    t.pass('closed for the reader is fulfilled');
    t.equal(rs.state, 'closed', 'the stream state is closed');
  });
});
