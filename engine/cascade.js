function inherit(child,parent) {
	child.prototype = Object.create(parent.prototype);
	child.prototype.constructor = child;
}

function SchemaType(instance,allowNull,allowUndef,customRestriction) {
	this.instance = instance;
	this.allowNull = allowNull;
	this.allowUndef = allowUndef;
	this.customRestriction = typeof customRestriction === "function" ? customRestriction : function() {
		return true;
	};
	this.argIsType = function(arg) {
		var res;
		if (arg === null) {
			res = this.nullable;
		} else if (typeof arg === "undefined") {
			res = this.undefinable;
		} else {
			res = typeof this.instance === typeof arg;
			if (res) {
				res = this.customRestriction(arg);
			}
		}
		return res;
	};
}
SchemaType.BOOLEAN = new SchemaType(false,false,false);
SchemaType.STRING = new SchemaType("",false,false);
SchemaType.STRING_NULLABLE = new SchemaType("",true,false);
SchemaType.FUNCTION = new SchemaType(function() {
},false,false);
SchemaType.OBJECT = new SchemaType({},false,false);
SchemaType.OBJECT_NULLABLE = new SchemaType({},true,false);

function Range(low,lowInclusive,high,highInclusive) {
	this.low = low;
	this.lowInclusive = lowInclusive;
	this.high = high;
	this.highInclusive = highInclusive;
	var _checkLow = function(t,n) {
		return t.lowInclusive ? n >= t.low : n > t.low;
	};
	var _checkHigh = function(t,n) {
		return t.highInclusive ? n <= t.high : n < t.high;
	};
	this.argInRange = function(n) {
		return _checkLow(this,n) && _checkHigh(this.n);
	};
	this.argNotInRange = function(n) {
		return !this.argInRange(n);
	};
}

function NumericSchemaType(integral,allowNaN,allowInfinity,range,allowNull,allowUndef) {
	allowNull = typeof allowNull !== "undefined" ? allowNull : false;
	allowUndef = typeof allowUndef !== "undefined" ? allowUndef : false;
	SchemaType.call(this,0,allowNull,allowUndef,function(n) {
		var res;
		if (Number.isNaN(n)) {
			res = allowNaN;
		} else if (!Number.isFinite(n)) {
			res = allowInfinity;
		} else {
			res = true;
			if (integral) {
				res &= Number.isInteger(n);
			}
			if (typeof range !== "undefined") {
				res &= range.argInRange(n);
			}
		}
		return res;
	});
}
inherit(NumericSchemaType,SchemaType);
NumericSchemaType.FLOAT = new NumericSchemaType(false,true,true);
NumericSchemaType.FLOAT_NOT_NAN = new NumericSchemaType(false,false,true);
NumericSchemaType.FLOAT_FINITE = new NumericSchemaType(false,false,false);
NumericSchemaType.FLOAT_POSITIVE = new NumericSchemaType(false,false,false,new Range(0,false,Number.POSITIVE_INFINITY,false));
NumericSchemaType.FLOAT_NON_NEGATIVE = new NumericSchemaType(false,false,false,new Range(0,true,Number.POSITIVE_INFINITY,false));
NumericSchemaType.FLOAT_NEGATIVE = new NumericSchemaType(false,false,false,new Range(Number.NEGATIVE_INFINITY,false,0,false));
NumericSchemaType.FLOAT_NON_POSITIVE = new NumericSchemaType(false,false,false,new Range(Number.NEGATIVE_INFINITY,false,0,true));
NumericSchemaType.INT = new NumericSchemaType(true,false,false);
NumericSchemaType.INT_POSITIVE = new NumericSchemaType(true,false,false,new Range(0,false,Number.POSITIVE_INFINITY,false));
NumericSchemaType.INT_NON_NEGATIVE = new NumericSchemaType(true,false,false,new Range(0,true,Number.POSITIVE_INFINITY,false));
NumericSchemaType.INT_NEGATIVE = new NumericSchemaType(true,false,false,new Range(Number.NEGATIVE_INFINITY,false,0,false));
NumericSchemaType.INT_NON_POSITIVE = new NumericSchemaType(true,false,false,new Range(Number.NEGATIVE_INFINITY,false,0,true));

function ObjectSchemaType(ctor,allowNull,allowUndef,customRestriction) {
	SchemaType.call(this,{},allowNull,allowUndef,function(obj) {
		var res = obj instanceof ctor;
		if (res && typeof customRestriction === "function") {
			res = customRestriction(obj);
		}
		return res;
	});
}

function CascadingSchema() {
	var _fields = {};
	this.getField = function(key) {
		return _fields.hasOwnProperty(key) ? _fields[key] : null;
	};
	this.setField = function(key,type) {
		_fields[key] = type;
	};
	this.forEach = function(callback,thisArg) {
		for (var key in _fields) {
			if (_fields.hasOwnProperty(key)) {
				callback.call(thisArg,_fields[key],key,this);
			}
		}
	};
}

function CascadeField(type) {
	var _t = this;
	var _value;
	this.active = false;
	this.type = type;
	Object.defineProperty(this,"value",{
		get: function() {
			return _value;
		},
		set: function(value) {
			if (_t.type.argIsType(value)) {
				_value = value;
				_t.active = true;
			} else {
				throw new TypeError("Value is not of required type.");
			}
		}
	});
}

function CascadingObject(schema,parent) {
	var _map = {};
	parent = typeof parent !== "undefined" ? parent : null;
	if (parent !== null) {
		if (parent.schema !== schema) {
			throw new Error("Parent object must have the same schame as this object.");
		} else {
			var tree = parent.getInheritanceTree();
			if (tree.indexOf(this) !== -1) {
				throw new Error("This object already exists in the parent's inheritance tree - cannot create a circular reference.");
			}
		}
	}
	this.parent = parent;
	this.depth = 0;
	this.schema = schema;
	while (parent !== null) {
		parent = parent.parent;
		this.depth++;
	}
	var _isValidKey = function(t,key) {
		return _reserved.indexOf(key) === -1 && t.schema.getField(key) !== null;
	};
	var _gmTree = function(t,key,arr) {
		if (!_isValidKey(t,key)) {
			throw new Error("Cascading field key \""+key+"\" is invalid: it may be reserved or undefined.");
		}
		try {
			var field = t.getFieldNoCascade(key);
			arr.push({
				value: field,
				definer: t
			});
		} catch (e) {
		}
		if (t.parent !== null) {
			_gmTree(t.parent,key,arr);
		}
	};
	this.forEach = function(callback,thisArg) {
		for (var key in _map) {
			if (_map.hasOwnProperty(key)) {
				callback(thisArg,key,this);
			}
		}
	};
	this.isValid = function() {
		var res = true;
		var temp;
		for (var key in _map) {
			if (_map.hasOwnProperty(key)) {
				try {
					temp = this[key];
				} catch (e) {
					res = false;
					break;
				}
			}
		}
		return res;
	};
	this.getInheritanceTree = function() {
		var tree = [this];
		var parent = this.parent;
		while (parent !== null) {
			tree.push(parent);
			parent = parent.parent;
		}
		return tree;
	};
	this.getMetadataTree = function(key) {
		var res = [];
		_gmTree(this,key,res);
		return res;
	};
	this.getMetadata = function(key) {
		if (!_isValidKey(this,key)) {
			throw new Error("Cascading field key \""+key+"\" is invalid: it may be reserved or undefined.");
		}
		try {
			var field = this.getFieldNoCascade(key);
			return {
				value: field,
				definer: this
			};
		} catch (e) {
			if (this.parent !== null) {
				return this.parent.getMetadata(key);
			} else {
				throw new Error("Cascading field \""+key+"\" has no value in this or any parent object.");
			}
		}
	};
	this.getFieldNoCascade = function(key) {
		if (!_isValidKey(this,key)) {
			throw new Error("Cascading field key \""+key+"\" is invalid: it may be reserved or undefined.");
		}
		var field = _map[key];
		if (field.active) {
			return field.value;
		} else {
			throw new Error("Cascading field \""+key+"\" has no value in this object.");
		}
	};

	var _reserved = [];
	for (var key in this) {
		if (this.hasOwnProperty(key)) {
			_reserved.push(key);
		}
	}

	schema.forEach(function(type,key) {
		if (!_isValidKey(this,key)) {
			throw new Error("Cascading field key \""+key+"\" is invalid: it may be reserved or undefined.");
		}
		_map[key] = new CascadeField(type);
		var t = this;
		Object.defineProperty(this,key,{
			get: function() {
				return t.getMetadata(key).value;
			},
			set: function(value) {
				if (!_isValidKey(t,key)) {
					throw new Error("Cascading field key \""+key+"\" is invalid: it may be reserved or undefined.");
				}
				_map[key].value = value;
				console.log(key,value,_map[key],t);
			}
		});
	},this);
}


