<a href="https://promisesaplus.com/">
    <img src="https://promisesaplus.com/assets/logo-small.png" alt="Promises/A+ logo"
         title="Promises/A+ 1.1 compliant" align="right" />
</a>
<a href="http://hprose.com/">
<img align="right" src="http://hprose.com/favicon-96x96.png" />
</a>
# Hprose for Node.js

[![Join the chat at https://gitter.im/hprose/hprose-nodejs](https://img.shields.io/badge/GITTER-join%20chat-green.svg)](https://gitter.im/hprose/hprose-nodejs?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![npm download](https://img.shields.io/npm/dm/hprose.svg)](https://www.npmjs.com/package/hprose)
[![optionalDependency Status](https://david-dm.org/hprose/hprose-nodejs/optional-status.svg)](https://david-dm.org/hprose/hprose-nodejs#info=optionalDependencies)
[![npm version](https://img.shields.io/npm/v/hprose.svg)](https://www.npmjs.com/package/hprose)
[![License](https://img.shields.io/npm/l/hprose.svg)](http://opensource.org/licenses/MIT)

>---
- **[Introduction](#introduction)**
- **[Usage](#usage)**
    - **[Http Server](#http-server)**
        - [Synchronous Functions or Methods](#synchronous-functions-or-methods)
        - [Asynchronous Functions or Methods](#asynchronous-functions-or-methods)
    - **[Http Client](#http-client)**
        - [Exception Handling](#exception-handling)
    - **[Tcp Server & Client](#tcp-server-client)**
    - **[Unix Socket Server & Client](#unix-socket-server-client)**
    - **[WebSocket Server & Client](#websocket-server-client)**

>---

## Introduction

*Hprose* is a High Performance Remote Object Service Engine.

It is a modern, lightweight, cross-language, cross-platform, object-oriented, high performance, remote dynamic communication middleware. It is not only easy to use, but powerful. You just need a little time to learn, then you can use it to easily construct cross language cross platform distributed application system.

*Hprose* supports many programming languages, for example:

* AAuto Quicker
* ActionScript
* ASP
* C++
* Dart
* Delphi/Free Pascal
* dotNET(C#, Visual Basic...)
* Golang
* Java
* JavaScript
* Node.js
* Objective-C
* Perl
* PHP
* Python
* Ruby
* ...

Through *Hprose*, You can conveniently and efficiently intercommunicate between those programming languages.

This project is the implementation of Hprose for Node.js.

## Usage

### Http Server

#### Synchronous Functions or Methods

Hprose for Node.js is very easy to use. You can create a hprose server like this:

```javascript
var hprose = require("hprose");
function hello(name) {
    return "Hello " + name + "!";
}
var server = hprose.Server.create("http://0.0.0.0:8080");
server.addFunction(hello);
server.start();
```

To start it use:

    node --harmony server.js

--harmony is a v8 options, hprose use it to optimize serialization.
This is not required option, but it is recommended to use it.

#### Asynchronous Functions or Methods

In fact most nodejs service methods are asynchronous, you can publish asynchronous function like this:

```javascript
var hprose = require("hprose");
function hello(name, callback) {
    setTimeout(function() {
        callback("Hello " + name + "!");
    }, 10);
}
var server = hprose.Server.create("http://0.0.0.0:8080");
server.addAsyncFunction(hello);
server.start();
```

### Http Client

Then you can create a hprose client to invoke it like this:

```javascript
var hprose = require("hprose");
var client = hprose.Client.create("http://127.0.0.1:8080/");
var proxy = client.useService();
proxy.hello("world", function(result) {
    console.log(result);
});
```

To start it use:

    node --harmony client.js

or

    node --harmony-proxies client.js

Without --harmony-proxies, you need create proxy like this:

```javascript
var hprose = require("hprose");
var client = hprose.Client.create("http://127.0.0.1:8080/");
var proxy = client.useService(["hello"]);
proxy.hello("world", function(result) {
    console.log(result);
});
```

Or create client like this:

```javascript
var hprose = require("hprose");
var client = hprose.Client.create("http://127.0.0.1:8080/", ["hello"]);
client.hello("world", function(result) {
    console.log(result);
});
```

#### Exception Handling

If an error occurred on the server, or your service function/method throw an exception, it will be sent to the client. You need to pass an error callback function after succuss callback function to receive it. If you omit this callback function, the client will ignore the exception, like never happened.

For example:

```javascript
proxy.hello("world", function(result) {
    console.log(result);
}, function(name, err) {
    console.error(err);
});
```

### Tcp Server & Client

The Tcp Server & Client are used as same as the Http Server & Client.

To create a Tcp Server:

```javascript
var server = hprose.Server.create("tcp://0.0.0.0:4321");
```

To create a Tcp Client:

```javascript
var client = hprose.Client.create('tcp://127.0.0.1:4321');
```

### Unix Socket Server & Client

The Unix Socket Server & Client are used as same as the Http Server & Client.

To create a Unix Socket Server:

```javascript
var server = hprose.Server.create("unix:/tmp/my.sock");
```

To create a Unix Socket Client:

```javascript
var client = hprose.Client.create('unix:/tmp/my.sock');
```

### WebSocket Server & Client

The WebSocket Server & Client are used as same as the Http Server & Client.

To create a WebSocket Server:

```javascript
var server = hprose.Server.create("ws://0.0.0.0:8080/");
```

To create a WebSocket Client:

```javascript
var client = hprose.Client.create('ws://0.0.0.0:8080/');
```
