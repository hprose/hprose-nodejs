var hprose = require('hprose');
module.exports = function(request, context, next) {
    console.log(hprose.BytesIO.toString(request));
    var response = next(request, context);
    if (hprose.Future.isPromise(response)) {
        response.then(function(data) {
            console.log(hprose.BytesIO.toString(data));
        });
    }
    else {
        console.log(hprose.BytesIO.toString(response));
    }
    return response;
};
