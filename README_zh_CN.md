# Hprose for Node.js

>---
- **[简介](#简介)**
- **[使用](#使用)**
    - **[Http 服务器](#http-服务器)**
        - [同步函数或方法](#同步函数或方法)
        - [异步函数或方法](#异步函数或方法)
    - **[Http 客户端](#http-客户端)**
        - [异常处理](#异常处理)

>---

## 简介

*Hprose* 是高性能远程对象服务引擎（High Performance Remote Object Service Engine）的缩写。

它是一个先进的轻量级的跨语言跨平台面向对象的高性能远程动态通讯中间件。它不仅简单易用，而且功能强大。你只需要稍许的时间去学习，就能用它轻松构建跨语言跨平台的分布式应用系统了。

*Hprose* 支持众多编程语言，例如：

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

通过 *Hprose*，你就可以在这些语言之间方便高效的实现互通了。

本项目是 Hprose 的 Node.js 语言版本实现。

## 使用

### Http 服务器

#### 同步函数或方法

Hprose for Node.js 使用很简单。你可用像这样创建 Hprose 服务器：

```javascript
require("hprose");
function hello(name) {
    return "Hello " + name + "!";
}
var server = new HproseHttpServer();
server.addFunction(hello);
server.listen(8080);
```

启动使用下面的命令：

    node --harmony server.js

--harmony 是 v8 的一个选项，Hprose 使用该选项对序列化进行了优化。它不是必须的选项，但是建议使用它。

#### 异步函数或方法

事实上，大多数 Node.js 服务是异步的，你可以像这样来发布异步函数或方法：

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

### Http 客户端

然后你可用创建 Hprose 客户端像这样来调用它：

```javascript
require("hprose");
var client = new HproseHttpClient('http://127.0.0.1:8080/');
var proxy = client.useService();
proxy.hello("world", function(result) {
    console.log(result);
});
```

使用如下命令启动它：

    node --harmony client.js

或者

    node --harmony-proxies client.js

如果没有 --harmony-proxies 参数，你将无法使用如下代码调用远程服务：

```javascript
proxy.hello("world", function(result) {
    console.log(result);
});
```

但是可以像这样来调用：

```javascript
client.invoke("hello", "world", function(result) {
    console.log(result);
});
```

#### 异常处理

如果服务器端发生错误，或者你的服务函数或方法抛出了异常，它将被发送到客户端。你可以在成功回调函数后面传入错误回调函数来接收它。如果你忽略该回调函数，客户端将忽略该异常，就像从来没发生过一样。

例如：

```javascript
proxy.hello("world", function(result) {
    console.log(result);
}, function(name, err) {
    console.error(err);
});
```

