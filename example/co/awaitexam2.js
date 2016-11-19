(async function() {
    try {
        console.log(await Promise.resolve("promise"));
        console.log(await function *() { return "generator" });
        console.log(await new Date());
        console.log(await 123);
        console.log(await 3.14);
        console.log(await "hello");
        console.log(await true);
    }
    catch (e) {
        console.error(e);
    }
})();
