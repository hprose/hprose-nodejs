var co = require('hprose').co;

co(function*() {
    try {
        console.log(yield Promise.resolve("promise"));
        console.log(yield function *() { return "generator" });
        console.log(yield new Date());
        console.log(yield 123);
        console.log(yield 3.14);
        console.log(yield "hello");
        console.log(yield true);
    }
    catch (e) {
        console.error(e);
    }
});
