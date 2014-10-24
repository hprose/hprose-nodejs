# Hprose for Node.js

>---
- **[Introduction](#introduction)**
- **[Usage](#usage)**
    - **[Http Server](#http-server)**
        - [Synchronous Functions or Methods](#synchronous-functions-or-methods)
        - [Asynchronous Functions or Methods](#asynchronous-functions-or-methods)
    - **[Http Client](#http-client)**
        - [Exception Handling](#exception-handling)
    - **[Tcp Server & Client](#tcp-server-client)**

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
require("hprose");
function hello(name) {
    return "Hello " + name + "!";
}
var server = new HproseHttpServer();
server.addFunction(hello);
server.listen(8080);
```

To start it use:

    node --harmony server.js

--harmony is a v8 options, hprose use it to optimize serialization.
This is not required option, but it is recommended to use it.

#### Asynchronous Functions or Methods

In fact most nodejs service methods are asynchronous, you can publish asynchronous function like this:

```javascript
require("hprose");
function hello(name, callback) {
    setTimeout(function() {
        callback("Hello " + name + "!");
    }, 10);
}
var server = new HproseHttpServer();
server.addAsyncFunction(hello);
server.listen(8080);
```

### Http Client

Then you can create a hprose client to invoke it like this:

```javascript
require("hprose");
var client = new HproseHttpClient('http://127.0.0.1:8080/');
var proxy = client.useService();
proxy.hello("world", function(result) {
    console.log(result);
});
```

To start it use:

    node --harmony client.js

or

    node --harmony-proxies client.js

Without --harmony-proxies, you can't use the following code to invoke remote service:

```javascript
proxy.hello("world", function(result) {
    console.log(result);
});
```

But you can invoke it like this:

```javascript
client.invoke("hello", "world", function(result) {
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
var server = new HproseTcpServer();
```

To create a Tcp Client:

```javascript
var client = new HproseTcpClient('tcp://127.0.0.1:4321');
```
