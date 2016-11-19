var hprose = require('hprose');

hprose.co(function*() {
    var client = hprose.Client.create('http://hprose.com/example/');
    try {
        console.log(yield client.invoke('ooxx'));
    }
    catch (e) {
        console.log(e.message);
    }
});