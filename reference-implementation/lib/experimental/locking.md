## What is the best developer-facing interface?

### Level 0: no reader usage

If the developer knows nothing about readers, they can continue using the stream just fine.

- `read()`, `state`, and `ready` all behave as they do now if used without `pipeTo`.
- `pipeTo` will cause the following side effects:
    - `read()` will throw an informative error
    - `state` will return `"ready"` until the pipe completes (successfully or otherwise)
    - `ready` will return a promise that remains pending until the pipe completes

### Level 1: using readers directly

The developer might want to create their own abstractions that require exclusive access to the stream. For example, a read-to-end function would probably want to avoid others being able to call `.read()` in the middle.

Example code:

```js
function readAsJson(rs) {
    var string = "";
    var reader = rs.getReader();

    pump();

    // These lines would be simpler with `Promise.prototype.finally`.
    return reader.closed.then(
        () => {
            reader.release();
            return JSON.parse(string);
        },
        e => {
            reader.release();
            throw e;
        }
    );

    function pump() {
        while (reader.state === "readable") {
            string += reader.read();
        }
        if (reader.state === "waiting") {
            reader.ready.then(pump);
        }
    }
}
```

The stream would have the same behaviors after being passed to `readAsJson` that it would have after calling its `pipeTo` method.

Additionally, it should be possible to check whether a stream is locked. A few candidate syntaxes:

```js
stream.isLocked
StreamReader.isLocked(stream)
```

Finally it is probably a good idea to be able to tell if a reader is still active/has been released. One of these two maybe:

```js
reader.isReleased
reader.active // inverse
```

### Level 2: subclassers of `ReadableStream`

Subclasses of `ReadableStream` should get locking support "for free." The same mechanisms for acquiring and using a lock should work flawlessly. More interestingly, if they wanted to support modifying the behavior of e.g. `read()` (or `state` or `ready` or `closed`), they should only have to override it in one location.

Which location is more friendly? Probably in `ReadableStream`, so that `StreamReader` still works for `ReadableStream` subclasses. Less work.

This means `StreamReader` should delegate to `ReadableStream`, and not the other way around.

### Level 3: custom readable stream implementations?

It is unclear whether this is necessary, but up until now we have a high level of support for anyone who wants to re-implement the entire `ReadableStream` interface with their own specific code. For example, if you implement `state`, `ready`, `closed`, `read()`, and `cancel()`, you can do `myCustomStream.pipeTo = ReadableStream.prototype.pipeTo` and it will continue to work.

If we encourage this kind of thing, we should make it easy for custom readable streams to be lockable as well. That basically means `StreamReader` should not require knowledge of `ReadableStream`'s internal slots.

We can work around this if necessary by passing `StreamReader` any capabilities it needs to manipulate `ReadableStream`'s internal state; then people reimplementing the readable stream interface can implement a `getReader` function that calls e.g. `new StreamReader(this, { getToken, setToken })` or similar.
