var hprose = require('hprose');
function stat(data, context) {
    if ('starttime' in context.userdata) {
        var t = Date.now() - context.userdata.starttime;
        console.log('It takes ' + t + ' ms.');
    }
    else {
        context.userdata.starttime = Date.now();
    }
    return data;
}
module.exports = {
    inputFilter: stat,
    outputFilter: stat
};
