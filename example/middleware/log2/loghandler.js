var hprose = require('hprose');
module.exports = function*(request, context, next) {
    console.log(hprose.BytesIO.toString(request));
    var response = yield next(request, context);
    console.log(hprose.BytesIO.toString(response));
    return response;
};
