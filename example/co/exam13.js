var hprose = require('hprose');

hprose.co(function*() {
    var client = hprose.Client.create('http://hprose.com/example/');
    console.log(yield client.invoke('oo').complete());
    console.log(yield client.invoke('xx').complete());
});