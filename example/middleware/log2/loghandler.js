var hprose = require('hprose');
module.exports = function(request, context, next) {
    console.log(hprose.BytesIO.toString(request));
    var response = next(request, context);
    response.then(function(data) {
        console.log(hprose.BytesIO.toString(data));
    });
    return response;
};
