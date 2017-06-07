function inherit(child,parent) {
	child.prototype = Object.create(parent.prototype);
	child.prototype.constructur = child;
}

function DOMVisitor(root,visitRoot) {
	var _frame = function(node,callback,thisArg) {
		for (var i = 0; i < node.childNodes.length; i++) {
			_visit(node.childNodes[i],callback,thisArg);
		}
	};
	var _visit = function(node,callback,thisArg) {
		var suppress = callback.call(thisArg,node,true);
		if (!suppress) {
			_frame(node,callback,thisArg);
		}
		callback.call(thisArg,node,false);
	};
	this.run = function(callback,thisArg) {
		if (visitRoot) {
			console.log("x");
			callback.call(thisArg,root,true);
		}
		_frame(root,callback,thisArg);
		if (visitRoot) {
			console.log("y");
			callback.call(thisArg,root,false);
		}
	};
}

function TextDelayRule(chars,time) {
	this.chars = chars;
	this.time = time;
}
TextDelayRule.parse = function(node) {
	return new TextDelayRule(decodeEntities(node.getAttribute("chars")).split(""),parseInt(node.getAttribute("time")));
};

function TextDelay(baseTime,lineTime) {
	var _rules = [];
	this.base = baseTime;
	this.line = lineTime;
	this.getRules = function() {
		return _rules;
	};
	this.addRule = function(rule) {
		_rules.push(rule);
	};
	this.concatRules = function(rules) {
		_rules = _rules.concat(rules);
	};
	this.getDelay = function(text,playhead) {
		text = text[playhead];
		var res = null;
		var passed;
		_rules.some(function(rule) {
			passed = rule.chars.indexOf(text) !== -1;
			if (passed) {
				res = rule.time;
			}
			return passed;
		});
		if (res === null) {
			res = this.base;
		}
		return res;
	};
}

function StyleClass(id,color,bgColor,linkColor,bold,italics,textDelay) {
	this.id = id;
	this.color = color;
	this.bgColor = bgColor;
	this.linkColor = linkColor;
	this.bold = bold;
	this.italics = italics;
	this.textDelay = textDelay;
}
StyleClass.attrNameToField = function(sc,attrName) {
	switch (attrName) {
		case "baseDelay":
			return sc.textDelay.base;
		case "lineDelay":
			return sc.textDelay.line;
		default:
			return sc[attrName];
	}
};
StyleClass.getAttr = function(classDef,attrName,parent) {
	var res = classDef.getAttribute(attrName);
	if (res === null) {
		if (parent === null) {
			throw new Error("Default styling must specify attribute \""+attrName+"\".");
		} else {
			res = StyleClass.attrNameToField(parent,attrName);
		}
	}
	return res;
};
StyleClass.parse = function(classDef,classes,parent) {
	var id = classDef.getAttribute("id");
	if (id !== null) {
		id = decodeEntities(id);
	}
	if (classes.hasOwnProperty(id)) {
		throw new Error("Duplicate class ID \""+id+"\".");
	}
	var parentAttr = classDef.getAttribute("parent");
	if (parentAttr !== null) {
		parentAttr = decodeEntities(parentAttr);
		if (!classes.hasOwnProperty(parentAttr)) {
			throw new Error("Class \""+id+"\" cannot have parent \""+parentAttr+"\" because no such parent has been defined.");
		}
		parent = classes[parentAttr];
	}
	var color = StyleClass.getAttr(classDef,"color",parent);
	var bgColor = StyleClass.getAttr(classDef,"bgColor",parent);
	var linkColor = StyleClass.getAttr(classDef,"linkColor",parent);
	var bold = StyleClass.getAttr(classDef,"bold",parent) == "1";
	var italics = StyleClass.getAttr(classDef,"italics",parent) == "1";
	var textDelay = new TextDelay(parseInt(StyleClass.getAttr(classDef,"baseDelay",parent)),parseInt(StyleClass.getAttr(classDef,"lineDelay",parent)));
	var nodes = classDef.getElementsByTagName("delay");
	var node;
	for (var i = 0; i < nodes.length; i++) {
		textDelay.addRule(TextDelayRule.parse(nodes[i]));
	}
	if (parent !== null) {
		textDelay.concatRules(parent.textDelay.getRules());
	}
	return new StyleClass(id,color,bgColor,linkColor,bold,italics,textDelay);
};

function Styling() {
	this.default = null;
	this.classes = {};
}
Styling.parse = function(xml,styling) {
	var def = firstTag(xml,"default");
	styling.default = StyleClass.parse(def,styling.classes,null);
	var classDefs = xml.getElementsByTagName("class");
	var classDef;
	for (var i = 0; i < classDefs.length; i++) {
		classDef = StyleClass.parse(classDefs[i],styling.classes,styling.default);
		styling.classes[classDef.id] = classDef;
	}
};

function EnvCanvas(width,height,fontSize,saveText,accelText,nextText) {
	this.width = width;
	this.height = height;
	this.fontSize = fontSize;
	this.saveText = saveText;
	this.accelText = accelText;
	this.nextText = nextText;
}
EnvCanvas.parse = function(xml) {
	var width = parseInt(xml.getAttribute("width"));
	var height = parseInt(xml.getAttribute("height"));
	var fontSize = parseFloat(xml.getAttribute("fontSize"));
	var saveText = decodeEntities(xml.getAttribute("saveText"));
	var accelText = decodeEntities(xml.getAttribute("accelText"));
	var nextText = decodeEntities(xml.getAttribute("nextText"));
	return new EnvCanvas(width,height,fontSize,saveText,accelText,nextText);
};

function Environment() {
	this.title = null;
	this.canvas = null;
	this.styling = new Styling();
}
Environment.parse = function(xml) {
	var res = new Environment();
	res.title = decodeEntities(firstTag(xml,"title").textContent);
	res.canvas = EnvCanvas.parse(firstTag(xml,"canvas"));
	var styling = firstTag(xml,"styling");
	Styling.parse(styling,res.styling);
	return res;
};

function FlowNode() {
	this.run = function(ctx,callback) {
		throw new Error("Unimplemented abstract method \"run\".");
	};
	this.skip = function(ctx,skipN) {
		throw new Error("Unimplemented abstract method \"skip\".");
	};
	this.setTimeout = function(callback,time) {
		if (FlowNode.accelerate) {
			callback();
		} else {
			FlowNode.timeout = setTimeout(function() {
				FlowNode.timeout = null;
				FlowNode.timeoutCallback = null;
				callback();
			},time);
			FlowNode.timeoutCallback = callback;
		}
	};
}
FlowNode.timeout = null;
FlowNode.timeoutCallback = null;
FlowNode.accelerate = false;
FlowNode.clearTimeouts = function() {
	if (FlowNode.timeout !== null) {
		clearTimeout(FlowNode.timeout);
		var callback = FlowNode.timeoutCallback;
		FlowNode.timeout = null;
		FlowNode.timeouCallback = null;
		callback();
	}
};
function SwitchStyleFlowNode(classDef) {
	FlowNode.call(this);
	this.run = function(ctx,callback) {
		console.log("[FLOW] Style switch");
		ctx.styling = classDef;
		callback();
	};
	this.skip = function(ctx,skipN) {
		ctx.styling = classDef;
		return skipN;
	};
}
inherit(SwitchStyleFlowNode,FlowNode);
function WaitFlowNode(waitTime) {
	FlowNode.call(this);
	this.run = function(ctx,callback) {
		console.log("[FLOW] Waiting for "+waitTime+"ms");
		this.setTimeout(callback,waitTime);
	};
	this.skip = function(ctx,skipN) {
		return skipN;
	};
}
inherit(WaitFlowNode,FlowNode);
function OpenTextFlowNode(x,y) {
	FlowNode.call(this);
	this.run = function(ctx,callback) {
		console.log("[FLOW] Updating text position to ["+x+", "+y+"]");
		ctx.clear();
		ctx.changePosition(x,y);
		callback();
	};
	this.skip = function(ctx,skipN) {
		ctx.changePosition(x,y);
		return skipN;
	};
}
inherit(OpenTextFlowNode,FlowNode);
function TextFlowNode(classDef) {
	FlowNode.call(this);
	this.delayCallback = function(callback,delay) {
		if (delay > 0) {
			this.setTimeout(callback,delay);
		} else {
			callback();
		}
	};
	this.skip = function(ctx,skipN) {
		return skipN;
	};
}
inherit(TextFlowNode,FlowNode);
function TextStartLineFlowNode(classDef) {
	TextFlowNode.call(this,classDef);
	this.run = function(ctx,callback) {
		console.log("[FLOW] Starting line");
		ctx.beginLine(classDef);
		callback();
	};
}
inherit(TextStartLineFlowNode,TextFlowNode);
function TextEndLineFlowNode(classDef) {
	TextFlowNode.call(this,classDef);
	this.run = function(ctx,callback) {
		console.log("[FLOW] Ending line");
		ctx.endLine();
		this.delayCallback(callback,classDef.textDelay.line);
	};
}
inherit(TextEndLineFlowNode,TextFlowNode);
function TextSpanFlowNode(text,classDef) {
	TextFlowNode.call(this,classDef);
	var _drawText = function(ctx,playhead,callback,t) {
		ctx.pushText(text[playhead]);
		ctx.render();
		t.delayCallback(callback,classDef.textDelay.getDelay(text,playhead));
	};
	var _step = function(ctx,callback,i,t) {
		if (text.length === 0) {
			callback();
		} else {
			_drawText(ctx,i,function() {
				i++;
				if (i === text.length) {
					callback();
				} else {
					_step(ctx,callback,i,t);
				}
			},t);
		}
	};
	this.run = function(ctx,callback) {
		console.log("[FLOW] Drawing text span \""+text+"\"");
		_step(ctx,callback,0,this);
	};
}
inherit(TextSpanFlowNode,TextFlowNode);
function UserFlowNode() {
	FlowNode.call(this);
	this.run = function(ctx,callback) {
		console.log("[FLOW] Awaiting user input...");
		ctx.awaitUserInput(callback);
	};
	this.skip = function(ctx,skipN) {
		ctx.incrementPageNumber();
		return skipN - 1;
	};
}
inherit(UserFlowNode,FlowNode);

function Flow() {
	this.nodes = [];
	this.skip = function(ctx,skipN) {
		var newSkipN = this.nodes.shift().skip(ctx,skipN);
		if (newSkipN === 0) {
			this.next(ctx);
		} else {
			this.skip(ctx,newSkipN);
		}
	};
	this.next = function(ctx) {
		var t = this;
		var node = this.nodes.shift();
		if (typeof node !== "undefined") {
			node.run(ctx,function() {
				t.next(ctx);
			});
		} else {
			console.log("[FLOW] End of node queue.");
		}
	};
}
Flow.parse = function(xml,env) {
	var currentStyle = env.styling.default;
	var styleStack = [currentStyle];
	var nodeStack = [null];
	var inText = false;
	var inLine = false;
	var res = new Flow();
	res.nodes.push(new SwitchStyleFlowNode(currentStyle));
	var visitor = new DOMVisitor(xml,false);
	var x = [];
	var y = [];
	var line;
	var update = function(node,attr,arr) {
		var newVar = node.getAttribute(attr);
		if (newVar !== null) {
			arr.push(parseInt(newVar));
		}
	};
	var revert = function(node,attr,arr) {
		if (node.hasAttribute(attr)) {
			arr.pop();
		}
	};
	var getCoord = function(node,attr,arr) {
		var newVar = node.getAttribute(attr);
		return newVar !== null ? parseInt(newVar) : peek(arr);
	};
	visitor.run(function(node,opener) {
		var suppress = false;
		if (node.nodeType === Node.TEXT_NODE && opener && node.textContent.trim().length > 0) {
			res.nodes.push(new TextSpanFlowNode(node.textContent,currentStyle));
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			var currentNode = peek(nodeStack);
			var classId = node.getAttribute("class");
			var hasClass = classId !== null;
			if (hasClass && !env.styling.classes.hasOwnProperty(classId)) {
				throw new Error("Class \""+classId+"\" is undefined.");
			}
			if (opener) {
				nodeStack.push(node);
				if (hasClass) {
					currentStyle = env.styling.classes[decodeEntities(classId)];
					styleStack.push(currentStyle);
					res.nodes.push(new SwitchStyleFlowNode(currentStyle));
				}
			} else {
				nodeStack.pop();
			}
			switch (node.tagName) {
				case "block":
					if (opener) {
						if (inLine) {
							throw new Error("Block node cannot occur inside a line node.");
						}
						update(node,"x",x);
						update(node,"y",y);
					} else {
						revert(node,"x",x);
						revert(node,"y",y);
					}
					break;
				case "wait":
					if (opener) {
						if (inText) {
							throw new Error("Wait node cannot occur inside a text node.");
						} else if (inLine) {
							throw new Error("Wait node cannot occur inside a line node.");
						}
						res.nodes.push(new WaitFlowNode(parseInt(node.textContent)));
						suppress = true;
					}
					break;
				case "text":
					if (inText) {
						if (opener) {
							throw new Error("Cannot nest text nodes.");
						} else {
							inText = false;
						}
					} else if (opener) {
						if (inLine) {
							throw new Error("Text node cannot occur inside a line node.");
						}
						inText = true;
						res.nodes.push(new OpenTextFlowNode(getCoord(node,"x",x),getCoord(node,"y",y)));
					} else {
						// ???
						throw new Error("What the fuck have you done.");
					}
					break;
				case "line":
					if (opener) {
						if (!inText) {
							throw new Error("Line nodes must be inside text nodes.");
						} else if (inLine) {
							throw new Error("Line node cannot occur inside a line node.");
						}
						res.nodes.push(new TextStartLineFlowNode(currentStyle));
						//line = new TextLineFlowNode(typeof node.textContent !== "undefined" ? decodeEntities(node.textContent) : "",currentStyle);
						//res.nodes.push(line);
						inLine = true;
					} else {
						res.nodes.push(new TextEndLineFlowNode(currentStyle));
						inLine = false;
					}
					break;
				case "span":
					if (opener) {
						if (!inLine) {
							throw new Error("Span nodes must be inside line nodes.");
						} else if (node.children.length > 0) {
							throw new Error("Span nodes can have no element children.");
						}
						res.nodes.push(new TextSpanFlowNode(node.textContent,currentStyle));
						suppress = true;
					}
					break;
				case "user":
					if (opener) {
						if (inText) {
							throw new Error("User node cannot occur inside a text node.");
						} else if (inLine) {
							throw new Error("User node cannot occur inside a line node.");
						} else if (node.children.length > 0) {
							throw new Error("User node can have no element children.");
						} else if (node.textContent.length > 0) {
							throw new Error("User node can have no text content.");
						}
						res.nodes.push(new UserFlowNode());
						suppress = true;
					}
					break;
				default:
					throw new Error("Flow node \""+node.tagName+"\" is undefined.");
			}
			if (!opener && hasClass) {
				styleStack.pop();
				currentStyle = peek(styleStack);
				res.nodes.push(new SwitchStyleFlowNode(currentStyle));
			}
		}
		return suppress;
	});
	return res;
};

function RenderableSegment(text,x,y,styling) {
	this.text = text;
	this.x = x;
	this.y = y;
	this.styling = styling;
	this.render = function(ctx,font) {
		var f2 = "";
		if (this.styling.italics) {
			f2 += "italic ";
		}
		if (this.styling.bold) {
			f2 += "bold ";
		}
		f2 += font;
		ctx.font = f2;
		ctx.fillStyle = this.styling.color;
		ctx.textAlign = this.styling.align;
		ctx.fillText(this.text,this.x,this.y);
	};
}

function TextRenderer(charWidth,charHeight,canvasWidth,canvasHeight,nextArrow,saveInd,accelLink,container,font) {
	var _segments = [];
	var _textBacklog = "";
	var _initX;
	var _x;
	var _y;
	var _textStyling;
	this.canvasStyling = null;
	this.reset = function() {
		this.clear();
		_initX = undefined;
		_x = undefined;
		_y = undefined;
		_textStyling = undefined;
		this.canvasStyling = null;
	};
	this.clear = function() {
		_segments.length = 0;
		_textBacklog = "";
	};
	this.changePosition = function(x,y) {
		_initX = x*charWidth;
		_x = _initX;
		_y = y*charHeight;
	};
	this.newLine = function() {
		this.finish();
		_x = _initX;
		_y += charHeight;
	};
	this.setStyle = function(style) {
		this.finish();
		_textStyling = style;
	};
	this.finish = function() {
		if (_textBacklog.length > 0) {
			_segments.push(new RenderableSegment(_textBacklog,_x,_y,_textStyling));
			_x += _textBacklog.length*charWidth;
			_textBacklog = "";
		}
	};
	this.pushText = function(text) {
		_textBacklog += text;
	};
	this.render = function(ctx) {
		nextArrow.style.color = this.canvasStyling.linkColor;
		saveInd.style.color = this.canvasStyling.linkColor;
		accelLink.style.color = this.canvasStyling.linkColor;
		nextArrow.style.backgroundColor = this.canvasStyling.bgColor;
		saveInd.style.backgroundColor = this.canvasStyling.bgColor;
		accelLink.style.backgroundColor = this.canvasStyling.bgColor;
		ctx.clearRect(0,0,canvasWidth,canvasHeight);
		container.parentElement.style.backgroundColor = this.canvasStyling.bgColor;
		ctx.fillStyle = this.canvasStyling.bgColor;
		ctx.fillRect(0,0,canvasWidth,canvasHeight);
		_segments.forEach(function(segment) {
			segment.render(ctx,font);
		});
		if (_textBacklog.length > 0) {
			var tempSegment = new RenderableSegment(_textBacklog,_x,_y,_textStyling);
			tempSegment.render(ctx,font);
		}
	};
}

function FlowContext(container,env,flow) {
	document.title += " - "+env.title;
	history.replaceState({},document.title,location.href);
	var font = env.canvas.fontSize+"em "+"'Courier New',monospace";
	var textSample = document.createElement("span");
		textSample.className = "offscreen";
		textSample.style.font = font;
		textSample.textContent = "x";
	document.body.appendChild(textSample);
	var _width = textSample.clientWidth;
	var _height = textSample.clientHeight;
	var _cWidth = _width*env.canvas.width*env.canvas.fontSize;
	var _cHeight = _width*env.canvas.height*env.canvas.fontSize;
	document.body.removeChild(textSample);
	var canvas = document.createElement("canvas");
		canvas.className = "text";
		canvas.width = _cWidth;
		canvas.height = _cHeight;
		canvas.textContent = "If you are seeing this text, your browser is not supported.";
	container.appendChild(canvas);
	var ctx = canvas.getContext("2d");
	var pageN = 0;
	var saveHref = "#";
	var btnContainer = document.createElement("div");
		btnContainer.className = "btn-container";
		var saveIndicator = document.createElement("button");
			saveIndicator.className = "save";
			saveIndicator.style.font = "bold "+font;
			saveIndicator.textContent = env.canvas.saveText;
			saveIndicator.addEventListener("click",function() {
				history.pushState({},document.title,saveHref);
			});
		btnContainer.appendChild(saveIndicator);
		var accelLink = document.createElement("button");
			accelLink.className = "accel";
			accelLink.style.font = "bold "+font;
			accelLink.textContent = env.canvas.accelText;
			accelLink.addEventListener("click",function() {
				FlowNode.accelerate = true;
				FlowNode.clearTimeouts();
			});
		btnContainer.appendChild(accelLink);
		var nextArrow = document.createElement("button");
			nextArrow.className = "arrow";
			nextArrow.style.font = "bold "+font;
			nextArrow.style.display = "none";
			nextArrow.textContent = env.canvas.nextText;
		btnContainer.appendChild(nextArrow);
	container.parentElement.appendChild(btnContainer);
	var _renderer = new TextRenderer(_width,_height,_cWidth,_cHeight,nextArrow,saveIndicator,accelLink,container,font);
	var _styling = null;
	var _styleStack = [];
	Object.defineProperty(this,"styling",{
		get: function() {
			return _styling;
		},
		set: function(value) {
			_styling = value;
			_renderer.canvasStyling = value;
			_renderer.setStyle(value);
			_renderer.render(ctx);
		}
	});
	this.getPageNumber = function() {
		return pageN;
	};
	this.incrementPageNumber = function() {
		pageN++;
		saveIndicator.href = "?progress="+pageN;
	};
	this.clear = function() {
		_renderer.clear();
	};
	this.changePosition = function(x,y) {
		_renderer.changePosition(x,y);
	};
	this.beginLine = function(styling) {
		this.beginSpan(styling);
	};
	this.endLine = function() {
		this.endSpan();
		_renderer.newLine();
	};
	this.beginSpan = function(styling) {
		_renderer.setStyle(styling);
	};
	this.endSpan = function() {
		_styleStack.pop();
		_renderer.setStyle(peek(_styleStack));
	};
	this.pushText = function(text) {
		_renderer.pushText(text);
	};
	this.finish = function() {
		_renderer.finish();
	};
	this.render = function() {
		_renderer.render(ctx);
	};
	this.awaitUserInput = function(callback) {
		var t = this;
		var nextListener = function() {
			nextArrow.removeEventListener("click",nextListener);
			nextArrow.style.display = "none";
			pageN++;
			saveHref = "?progress="+pageN;
			FlowNode.accelerate = false;
			t.clear();
			t.render();
			callback();
		};
		nextArrow.style.display = "";
		nextArrow.addEventListener("click",nextListener);
	};
}

var deArea = document.createElement("textarea");
function decodeEntities(text) {
	deArea.innerHTML = text;
	return deArea.value;
}

function peek(arr) {
	return arr.length > 0 ? arr[arr.length - 1] : null;
}

function firstTag(xml,tagName) {
	var all = xml.getElementsByTagName(tagName);
	return all.length > 0 ? all[0] : null;
}

function createFrame() {
	document.body.textContent = "";
	var frame = document.createElement("div");
		frame.className = "frame";
		var innerFrame = document.createElement("div");
			innerFrame.className = "innerFrame";
			innerFrame.textContent = "Loading...";
		frame.appendChild(innerFrame);
	document.body.appendChild(frame);
	return innerFrame;
}

function parseNovel(xml) {
	var root = xml.documentElement;
	var err = firstTag(root,"parsererror");
	if (err !== null) {
		throw new Error(err.textContent);
	}
	var env = Environment.parse(firstTag(root,"env"));
	return {
		env: env,
		flow: Flow.parse(firstTag(root,"flow"),env)
	};
}

function loadNovel(frame,callback) {
	var req = new AJAXRequest(HTTPMethods.GET,"user/novel.xml");
	req.execute(function(res) {
		try {
			if (res.success) {
				var xml = (new DOMParser()).parseFromString(res.text,"application/xml");
				callback(parseNovel(xml));
			} else {
				frame.style.textAlign = "left";
				document.getElementById("frame").textContent = "ERROR: HTTP "+res.status;
			}
		} catch (e) {
			frame.style.textAlign = "left";
			if (e.hasOwnProperty("stack")) {
				frame.innerHTML = "ERROR: "+e.stack.replace(/\n */g,"<br />&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;");
			} else {
				frame.textContent = "ERROR: "+e.message;
			}
		}
	});
}

window.addEventListener("DOMContentLoaded",function() {
	var frame = createFrame();
	loadNovel(frame,function(novel) {
		frame.textContent = "";
		var ctx = new FlowContext(frame,novel.env,novel.flow);
		if (location.search.length > 0) {
			var keys = location.search.substr(1).split("&");
			var found = keys.some(function(key) {
				key = key.split("=");
				var res = key[0] === "progress";
				if (res) {
					var n = parseInt(key[1]);
					if (n > 0) {
						novel.flow.skip(ctx,n);
					} else {
						novel.flow.next(ctx);
					}
				}
				return res;
			});
			if (!found) {
				novel.flow.next(ctx);
			}
		} else {
			novel.flow.next(ctx);
		}
	});
});