declare namespace hprose {
    class TimeoutError extends Error {
        constructor(message?: any);
    }
}
declare namespace hprose {
    function generic(method: any): (context: any) => any;
    function toArray(arrayLikeObject: any): any[];
    function toBinaryString(bytes: any): any;
    function toUint8Array(bs: any): Uint8Array;
    function isObjectEmpty(obj: any): boolean;
}
declare function genericMethods(obj: any, properties: any): void;
declare namespace hprose {
    function Future(computation?: any): void;
    let rejected: (e: any) => any;
    let resolved: (v: any) => any;
    function thunkify(fn: any): () => (done: any) => void;
    function promisify(fn: any): () => any;
    function co(gen: any): any;
    function Completer(): void;
    let deferred: () => any;
}
declare namespace hprose {
    function isError(err: any): boolean;
}
declare namespace hprose {
    let ResultMode: {
        Normal: number;
        Serialized: number;
        Raw: number;
        RawWithEndTag: number;
    };
    let Normal: number;
    let Serialized: number;
    let Raw: number;
    let RawWithEndTag: number;
}
declare namespace hprose {
    function BytesIO(arg?: any): void;
}
declare namespace hprose {
    function register(cls: any, alias: any): void;
    let ClassManager: any;
}
declare namespace hprose {
    let Tags: {
        TagInteger: number;
        TagLong: number;
        TagDouble: number;
        TagNull: number;
        TagEmpty: number;
        TagTrue: number;
        TagFalse: number;
        TagNaN: number;
        TagInfinity: number;
        TagDate: number;
        TagTime: number;
        TagUTC: number;
        TagBytes: number;
        TagUTF8Char: number;
        TagString: number;
        TagGuid: number;
        TagList: number;
        TagMap: number;
        TagClass: number;
        TagObject: number;
        TagRef: number;
        TagPos: number;
        TagNeg: number;
        TagSemicolon: number;
        TagOpenbrace: number;
        TagClosebrace: number;
        TagQuote: number;
        TagPoint: number;
        TagFunctions: number;
        TagCall: number;
        TagResult: number;
        TagArgument: number;
        TagError: number;
        TagEnd: number;
    };
}
declare namespace hprose {
    function Writer(stream: any, simple: any): void;
}
declare namespace hprose {
    function RawReader(stream: any): void;
    function Reader(stream: any, simple?: any, useHarmonyMap?: any): void;
}
declare namespace hprose {
    function serialize(value: any, simple: any): any;
    function unserialize(stream: any, simple: any, useHarmonyMap: any): any;
    let Formatter: {
        serialize: (value: any, simple: any) => any;
        unserialize: typeof unserialize;
    };
}
declare namespace hprose {
    function Client(uri: any, functions: any, settings: any): void;
}
declare namespace hprose {
    function HttpClient(uri: any, functions: any, settings: any): any;
}
declare namespace hprose {
    function SocketClient(uri: any, functions: any, settings: any): any;
    let TcpClient: typeof SocketClient;
    let UnixClient: typeof SocketClient;
}
declare namespace hprose {
    function WebSocketClient(uri: any, functions: any, settings: any): any;
}
declare namespace hprose {
    function Service(): void;
}
declare namespace hprose {
    function HttpService(): void;
}
declare namespace hprose {
    function HttpServer(port: any, hostname: any, tlsOptions: any): void;
}
declare namespace hprose {
    function SocketService(): void;
}
declare namespace hprose {
    function SocketServer(options: any, tlsOptions: any): void;
    let TcpServer: typeof SocketServer;
    let UnixServer: typeof SocketServer;
}
declare namespace hprose {
    function WebSocketService(): void;
}
declare namespace hprose {
    function WebSocketServer(options: any, tlsOptions: any, handler: any): void;
}
declare namespace hprose {
    function Server(uri: any, tlsOptions: any, handler: any): any;
}
declare namespace hprose {
    function JSONRPCClientFilter(version: any): void;
}
declare namespace hprose {
    function JSONRPCServiceFilter(): void;
}
declare let HproseCompleter: typeof hprose.Completer;
declare let HproseFuture: typeof hprose.Future;
declare let HproseResultMode: {
    Normal: number;
    Serialized: number;
    Raw: number;
    RawWithEndTag: number;
};
declare let HproseBytesIO: typeof hprose.BytesIO;
declare let HproseClassManager: any;
declare let HproseTags: {
    TagInteger: number;
    TagLong: number;
    TagDouble: number;
    TagNull: number;
    TagEmpty: number;
    TagTrue: number;
    TagFalse: number;
    TagNaN: number;
    TagInfinity: number;
    TagDate: number;
    TagTime: number;
    TagUTC: number;
    TagBytes: number;
    TagUTF8Char: number;
    TagString: number;
    TagGuid: number;
    TagList: number;
    TagMap: number;
    TagClass: number;
    TagObject: number;
    TagRef: number;
    TagPos: number;
    TagNeg: number;
    TagSemicolon: number;
    TagOpenbrace: number;
    TagClosebrace: number;
    TagQuote: number;
    TagPoint: number;
    TagFunctions: number;
    TagCall: number;
    TagResult: number;
    TagArgument: number;
    TagError: number;
    TagEnd: number;
};
declare let HproseWriter: typeof hprose.Writer;
declare let HproseRawReader: typeof hprose.RawReader;
declare let HproseFormatter: {
    serialize: (value: any, simple: any) => any;
    unserialize: typeof hprose.unserialize;
};
declare let HproseClient: typeof hprose.Client;
declare let HproseHttpClient: typeof hprose.HttpClient;
declare let HproseSocketClient: typeof hprose.SocketClient;
declare let HproseTcpClient: typeof hprose.SocketClient;
declare let HproseUnixClient: typeof hprose.SocketClient;
declare let HproseWebSocketClient: typeof hprose.WebSocketClient;
declare let HproseService: typeof hprose.Service;
declare let HproseServer: typeof hprose.Server;
declare let HproseHttpService: typeof hprose.HttpService;
declare let HproseHttpServer: typeof hprose.HttpServer;
declare let HproseSocketService: typeof hprose.SocketService;
declare let HproseSocketServer: typeof hprose.SocketServer;
declare let HproseTcpServer: typeof hprose.SocketServer;
declare let HproseUnixServer: typeof hprose.SocketServer;
declare let HproseWebSocketService: typeof hprose.WebSocketService;
declare let HproseWebSocketServer: typeof hprose.WebSocketServer;
declare let HproseJSONRPCClientFilter: typeof hprose.JSONRPCClientFilter;
declare let HproseJSONRPCServiceFilter: typeof hprose.JSONRPCServiceFilter;
declare namespace hprose {
    let common: {
        Completer: typeof Completer;
        Future: typeof Future;
        ResultMode: {
            Normal: number;
            Serialized: number;
            Raw: number;
            RawWithEndTag: number;
        };
    };
    let io: {
        BytesIO: typeof BytesIO;
        ClassManager: any;
        Tags: {
            TagInteger: number;
            TagLong: number;
            TagDouble: number;
            TagNull: number;
            TagEmpty: number;
            TagTrue: number;
            TagFalse: number;
            TagNaN: number;
            TagInfinity: number;
            TagDate: number;
            TagTime: number;
            TagUTC: number;
            TagBytes: number;
            TagUTF8Char: number;
            TagString: number;
            TagGuid: number;
            TagList: number;
            TagMap: number;
            TagClass: number;
            TagObject: number;
            TagRef: number;
            TagPos: number;
            TagNeg: number;
            TagSemicolon: number;
            TagOpenbrace: number;
            TagClosebrace: number;
            TagQuote: number;
            TagPoint: number;
            TagFunctions: number;
            TagCall: number;
            TagResult: number;
            TagArgument: number;
            TagError: number;
            TagEnd: number;
        };
        RawReader: typeof RawReader;
        Reader: typeof Reader;
        Writer: typeof Writer;
        Formatter: {
            serialize: (value: any, simple: any) => any;
            unserialize: typeof unserialize;
        };
    };
    let client: {
        Client: typeof Client;
        HttpClient: typeof HttpClient;
        SocketClient: typeof SocketClient;
        TcpClient: typeof SocketClient;
        UnixClient: typeof SocketClient;
        WebSocketClient: typeof WebSocketClient;
    };
    let server: {
        Service: typeof Service;
        Server: typeof Server;
        HttpService: typeof HttpService;
        HttpServer: typeof HttpServer;
        SocketService: typeof SocketService;
        SocketServer: typeof SocketServer;
        TcpServer: typeof SocketServer;
        UnixServer: typeof SocketServer;
        WebSocketService: typeof WebSocketService;
        WebSocketServer: typeof WebSocketServer;
    };
    let filter: {
        JSONRPCClientFilter: typeof JSONRPCClientFilter;
        JSONRPCServiceFilter: typeof JSONRPCServiceFilter;
    };
}
