/*global require, process, Promise*/

/*
 * Methods helping with promises (Promise/A+ model). Not a promise shim.
 */

function promise(obj) {
  // Promise object / function converter
  // Example:
  // promise("foo");
  //   // => Promise({state: "fullfilled", value: "foo"})
  // lively.lang.promise({then: (resolve, reject) => resolve(23)})
  //   // => Promise({state: "fullfilled", value: 23})
  // lively.lang.promise(function(val, thenDo) { thenDo(null, val + 1) })(3)
  //   // => Promise({state: "fullfilled", value: 4})
  return (typeof obj === "function") ?
    promise.convertCallbackFun(obj) :
    Promise.resolve(obj);
}


function delay(ms, resolveVal) {
  // Like `Promise.resolve(resolveVal)` but waits for `ms` milliseconds
  // before resolving
  return new Promise(resolve =>
    setTimeout(resolve, ms, resolveVal));
}

function delayReject(ms, rejectVal) {
  // like `promise.delay` but rejects
  return new Promise((_, reject) =>
    setTimeout(reject, ms, rejectVal));
}

function timeout(ms, promise) {
  // Takes a promise and either resolves to the value of the original promise
  // when it succeeds before `ms` milliseconds passed or fails with a timeout
  // error
  return new Promise((resolve, reject) => {
    var done = false;
    setTimeout(() => !done && (done = true) && reject(new Error('Promise timed out')), ms);
    promise.then(
      val => !done && (done = true) && resolve(val),
      err => !done && (done = true) && reject(err))
  });
}

function waitFor(ms, tester) {
  // Tests for a condition calling function `tester` until the result is
  // truthy. Resolves with last return value of `tester`. If `ms` is defined
  // and `ms` milliseconds passed, reject with timeout error

  return new Promise(function(resolve, reject) {
    if (typeof ms === "function") { tester = ms; ms = undefined; }
    var stopped = false,
        error = null,
        value = undefined,
        i = setInterval(function() {
          if (stopped) { clearInterval(i); return; }
          try { value = tester(); } catch (e) { error = e; }
          if (value || error) {
              stopped = true;
              clearInterval(i);
              error ? reject(error) : resolve(value);
          }
        }, 10);
    if (typeof ms === "number") {
      setTimeout(function() { error = new Error('timeout'); }, ms);
    }
  });
}

function deferred() {
  // returns an object
  // `{resolve: FUNCTION, reject: FUNCTION, promise: PROMISE}`
  // that separates the resolve/reject handling from the promise itself
  // Similar to the deprecated `Promise.defer()`
  var resolve, reject,
      promise = new Promise(function(_resolve, _reject) {
        resolve = _resolve; reject = _reject; });
  return {resolve: resolve, reject: reject, promise: promise};
}

function convertCallbackFun(func) {
  // Takes a function that accepts a nodejs-style callback function as a last
  // parameter and converts it to a function *not* taking the callback but
  // producing a promise instead. The promise will be resolved with the
  // *first* non-error argument.
  // nodejs callback convention: a function that takes as first parameter an
  // error arg and second+ parameters are the result(s).
  // Example:
  // var fs = require("fs"),
  //     readFile = promise.convertCallbackFun(fs.readFile);
  // readFile("./some-file.txt")
  //   .then(content => console.log(String(content)))
  //   .catch(err => console.error("Could not read file!", err));
  return function promiseGenerator(/*args*/) {
    var args = Array.from(arguments), self = this;
    return new Promise(function(resolve, reject) {
      args.push(function(err, result) { return err ? reject(err) : resolve(result); });
      func.apply(self, args);
    });
  };
}

function convertCallbackFunWithManyArgs(func) {
  // like convertCallbackFun but the promise will be resolved with the
  // all non-error arguments wrapped in an array.
  return function promiseGenerator(/*args*/) {
    var args = Array.from(arguments), self = this;
    return new Promise(function(resolve, reject) {
      args.push(function(/*err + args*/) {
        var args = Array.from(arguments),
            err = args.shift();
        return err ? reject(err) : resolve(args);
      });
      func.apply(self, args);
    });
  };
}

function _chainResolveNext(promiseFuncs, prevResult, akku, resolve, reject) {
  var next = promiseFuncs.shift();
  if (!next) resolve(prevResult);
  else {
    try {
      Promise.resolve(next(prevResult, akku))
        .then(result => _chainResolveNext(promiseFuncs, result, akku, resolve, reject))
        .catch(function(err) { reject(err); });
    } catch (err) { reject(err); }
  }
}

function chain(promiseFuncs) {
  // Similar to Promise.all but takes a list of promise-producing functions
  // (instead of Promises directly) that are run sequentially. Each function
  // gets the result of the previous promise and a shared "state" object passed
  // in. The function should return either a value or a promise. The result of
  // the entire chain call is a promise itself that either resolves to the last
  // returned value or rejects with an error that appeared somewhere in the
  // promise chain. In case of an error the chain stops at that point.
  // Example:
  // lively.lang.promise.chain([
  //   () => Promise.resolve(23),
  //   (prevVal, state) => { state.first = prevVal; return prevVal + 2 },
  //   (prevVal, state) => { state.second = prevVal; return state }
  // ]).then(result => console.log(result));
  // // => prints {first: 23,second: 25}
  return new Promise((resolve, reject) =>
    _chainResolveNext(
      promiseFuncs.slice(), undefined, {},
      resolve, reject));
}

function promise_finally(promise, finallyFn) {
  return Promise.resolve(promise)
    .then(result => { try { finallyFn(); } catch(err) { console.error("Error in promise finally: " + err.stack || err); }; return result; })
    .catch(err => { try { finallyFn(); } catch(err) { console.error("Error in promise finally: " + err.stack || err); }; throw err; });
}

// FIXME!
Object.assign(promise, {
  delay,
  delayReject,
  timeout,
  waitFor,
  deferred,
  convertCallbackFun,
  convertCallbackFunWithManyArgs,
  chain,
  "finally": promise_finally
});

export default promise;

export {
  promise,
  delay,
  delayReject,
  timeout,
  waitFor,
  deferred,
  convertCallbackFun,
  convertCallbackFunWithManyArgs,
  chain,
  promise_finally as finally,
}