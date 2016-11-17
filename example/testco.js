var co = require('../lib/hprose.js').co;

function* sleep() {
    return new Promise(function(resolve) {
        setTimeout(resolve, 1);
    });
};

co(function*() {

    for(var i = 0; true; ++i) {
        yield sleep();

        if (i % 10000 === 0) {
            console.log(process.memoryUsage());
        }

    }

}).then(function() {
    console.log('finished')
}, function(err) {
    console.log('caught error: ', err.stack);
});