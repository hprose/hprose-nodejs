var hprose = require('hprose');

hprose.co(function*() {
    var client = hprose.Client.create('http://hprose.com/example/');
    console.log(yield client.invoke('oo'));
    console.log(yield client.invoke('xx'));
}).catch(function(e) {
    console.log(e.message);
});