var hprose = require('hprose');
function log(data) {
    console.log(hprose.BytesIO.toString(data));
    return data;
}
module.exports = {
    inputFilter: log,
    outputFilter: log
};
