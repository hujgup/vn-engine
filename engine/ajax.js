function objectHasAnyProperty(obj) {
	var res;
	if (Object.getOwnPropertyNames) {
		res = Object.getOwnPropertyNames(obj).length !== 0;
	} else {
		res = false;
		for (var item in obj) { // ECMAScript 3 fallback (won't handle enumerable = false properties on ECMAScript 5 objects)
			if (obj.hasOwnProperty(item)) {
				res = true;
				break;
			}
		}
	}
	return res;
}
function objectShallowClone(obj) {
	var res = {};
	var names;
	if (Object.getOwnPropertyNames) {
		names = Object.getOwnPropertyNames(obj);
	} else {
		names = [];
		for (var item in obj) {
			if (obj.hasOwnProperty(item)) {
				names.push(item);
				break;
			}
		}
	}
	for (var i = 0; i < names.length; i++) {
		res[names[i]] = obj[names[i]];
	}
	return res;
}

var HTTPMethods = {
	OPTIONS: "OPTIONS",
	GET: "GET",
	HEAD: "HEAD",
	POST: "POST",
	PUT: "PUT",
	DELETE: "DELETE",
	TRACE: "TRACE",
	CONNECT: "CONNECT",
	isMethod: function(value) {
		value = value.toUpperCase();
		var res = false;
		for (var item in HTTPMethods) {
			if (HTTPMethods.hasOwnProperty(item) && item !== "isMethod") {
				if (value === HTTPMethods[item]) {
					res = true;
					break;
				}
			}
		}
		return res;
	}
};
var HTTPHeaders = {
	ACCEPT: "Accept",
	ACCEPT_LANGUAGE: "Accept-Language",
	AUTHORIZATION: "Authorization",
	CACHE_CONTROL: "Cache-Control",
	CONTENT_TYPE: "Content-Type",
	FROM: "From",
	IF_MATCH: "If-Match",
	IF_MODIFIED_SINCE: "If-Modified-Since",
	IF_NONE_MATCH: "If-None-Match",
	IF_RANGE: "If-Range",
	IF_UNMOFIFIED_SINCE: "If-Unmodified-Since",
	MAX_FORWARDS: "Max-Forwards",
	PRAGMA: "Pragma",
	RANGE: "Range",
	WARNING: "Warning",
	validHeader: function(key) {
		var res = false;
		for (var item in HTTPHeaders) {
			if (HTTPHeaders.hasOwnProperty(item) && item !== "validate" && item !== "validHeader" && item !== "validHeaderCollection") {
				if (HTTPHeaders[item] === key) {
					res = true;
					break;
				}
			}
		}
		return res;
	},
	validHeaderCollection: function(headers) {
		var res = true;
		for (var item in headers) {
			if (headers.hasOwnProperty(item)) {
				res = HTTPHeaders.validHeader(item,headers[item]);
				if (!res) {
					break;
				}
			}
		}
		return res;
	}
};

function AJAXResponse(status,raw,text,xml,type) {
	this.error = status >= 400;
	this.status = status;
	this.raw = raw;
	this.text = text;
	this.xml = xml;
	this.type = type;
	this.success = !this.error && typeof raw !== "undefined";
}
function AJAXRequest(method,url) {
	var _this = this;
	var _headers = {};
	var _data = {};

	this.method = method;
	this.url = url;

	Object.defineProperty(this,"ready",{
		enumerable: true,
		get: function() {
			return HTTPMethods.isMethod(_this.method) && typeof _this.url === "string";
		}
	});
	Object.defineProperty(this,"data",{
		enumerable: true,
		get: function() {
			return _data;
		},
		set: function(value) {
			if (typeof value === "object") {
				_data = value;
			}
		}
	});

	var _encodeData = function(appendTo) {
		var preExisting = typeof appendTo === "string";
		appendTo = preExisting ? appendTo : "";
		var append = "";
		if (preExisting) {
			append += appendTo.indexOf("?") === -1 ? "?" : "&";
		}
		for (var key in _data) {
			if (_data.hasOwnProperty(key)) {
				append += encodeURIComponent(key)+"="+encodeURIComponent(_data[key])+"&";
			}
		}
		append = append.substring(0,append.length - 1);
		appendTo += append;
		return appendTo;
	};

	this.hasHeader = function(key) {
		return _headers.hasOwnProperty(key);
	};
	this.getHeader = function(key) {
		return this.hasHeader(key) ? _headers[key] : null;
	};
	this.setHeader = function(key,value) {
		var res = HTTPHeaders.validHeader(key);
		if (res) {
			_headers[key] = value;
		}
		return res;
	};
	this.unsetHeader = function(key) {
		if (this.hasHeader(key)) {
			delete _headers[key];
		}
	};
	this.queue = function(callback,mime) {
		var res = typeof callback === "function";
		if (res) {
			AJAXRequest._queue.push(new QueueItem(this,callback,mime));
		}
		return res;
	};
	this.execute = function(callback,mime) {
		callback = typeof callback === "function" ? callback : function() { };
		var res = AJAXRequest.errorMask.NULL;
		if (this.ready) {
			if (!HTTPMethods.isMethod(this.method)) {
				res |= AJAXRequest.errorMask.BAD_METHOD;
			}
			if (typeof this.url !== "string") {
				res |= AJAXRequest.errorMask.BAD_URL;
			}
		} else {
			res |= AJAXRequest.errorMask.BAD_METHOD | AJAXRequest.errorMask.BAD_URL;
		}
		if (res === AJAXRequest.errorMask.NULL) {
			try {
				var hasMIME = typeof mime === "string";
				var upperMethod = this.method.toUpperCase();
				var post = upperMethod === HTTPMethods.POST;
				var customData = objectHasAnyProperty(_data);
				var url = this.url;
				if (customData && !post) {
					url = _encodeData(url);
				}
				var req = new XMLHttpRequest();
				req.open(upperMethod,url,true);
				for (var key in _headers) {
					if (_headers.hasOwnProperty(key)) {
						req.setRequestHeader(key,_headers[key]);
					}
				}
				if (post) {
					req.setRequestHeader(HTTPHeaders.CONTENT_TYPE,"application/x-www-form-urlencoded");
				}
				req.onreadystatechange = function() {
					if (req.readyState === 4) {
						callback(new AJAXResponse(req.status,req.response,req.responseText,req.responseXML,req.responseType));
					}
				};
				req.onabort = function() {
					callback(new AJAXResponse(0));
				};
				if (hasMIME) {
					req.overrideMimeType(mime);
				}
				if (customData && post) {
					req.send(_encodeData());
				} else {
					req.send();
				}
			} catch (e) {
				callback(new AJAXResponse(0));
			}
		}
		return res;
	};

	// Backwards compatability
	// These methods are deprecated and should not be used in new applications
	this.getMethod = function() {
		return this.method;
	};
	this.setMethod = function(value) {
		this.method = value;
		return true;
	};
	this.getURL = function() {
		return this.url;
	};
	this.setURL = function(value) {
		this.url = value;
		return true;
	};
	this.resetHeader = function(key) {
		this.unsetHeader(key);
	};
	this.getAllHeaders = function() {
		return objectShallowClone(_headers);
	};
	this.setAllHeaders = function(value) {
		var res = HTTPHeaders.validHeaderCollection(value);
		if (res) {
			_headers = objectShallowClone(value);
		}
		return res;
	};
	this.getPostData = function() {
		return this.method === HTTPMethods.POST ? objectShallowClone(_data) : null;
	};
	this.setPostData = function(value) {
		var res = _method === HTTPMethods.POST;
		if (res) {
			_postData = objectShallowClone(value);
		}
		return res;
	};
}
AJAXRequest.MAXIMUM_THREADS = 16;
AJAXRequest._threads = 0;
AJAXRequest._queue = [];
AJAXRequest.errorMask = {
	NULL: 0,
	BAD_METHOD: 1,
	BAD_URL: 2
};
AJAXRequest.createQueryString = function(value) {
	// Backwards compatability
	// This method is deprecated and should not be used in new applications
	var res = "";
	if (objectHasAnyProperty(value)) {
		res += "?";
		for (var key in value) {
			if (value.hasOwnProperty(key)) {
				res += encodeURIComponent(key)+"="+encodeURIComponent(value[item])+"&";
			}
		}
		res = res.substring(0,res.length - 1);
	}
	return res;
};

function QueueItem(req,callback,mime) {
	this.request = req;
	this.callback = callback;
	this.mime = mime;
}

setInterval(function() {
	var item;
	while (AJAXRequest._queue.length !== 0 && AJAXRequest._threads < AJAXRequest.MAXIMUM_THREADS) {
		AJAXRequest._threads++;
		var item = AJAXRequest._queue.shift();
		item.request.execute(function(res) {
			AJAXRequest._threads--;
			item.callback(res);
		},item.mime);
	}
},16);


/*
var req = new AJAXRequest(HTTPMethods.GET,"global.js");
req.execute(function(res) {
	console.log(res.text);
});
*/