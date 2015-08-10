var hprose = require('hprose');
module.exports = function(message) {
    return function(request, context, next) {
        console.log(message + ' request size: ' + request.length);
        var response = next(request, context);
        if (hprose.Future.isPromise(response)) {
            response.then(function(data) {
                console.log(message + ' response size: ' + data.length);
            });
        }
        else {
            console.log(message + ' response size: ' + response.length);
        }
        return response;
    };
};
