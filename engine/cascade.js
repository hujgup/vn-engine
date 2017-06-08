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
SchemaType.ARRAY = new SchemaType([],false,false,function(arr) {
	return Array.isArray(arr);
});
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
		return _checkLow(this,n) && _checkHigh(this,n);
	};
	this.argNotInRange = function(n) {
		return !this.argInRange(n);
	};
}

function NumericSchemaType(integral,allowNaN,allowInfinity,range,allowNull,allowUndef) {
	range = typeof range !== "undefined" ? range : new Range(Number.NEGATIVE_INFINITY,true,Number.POSITIVE_INFINITY,true);
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
				throw new TypeError("Value is not of required type (expected "+(typeof _t.type.instance)+" but was "+(typeof value)+").");
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
	this.setFieldIfDifferent = function(key,value) {
		try {
			var existing = this[key];
			if (existing !== value) {
				this[key] = value;
			}
		} catch (e) {
			// If undefined, set
			// If error was thrown because key is invalid, it will just get thrown again
			this[key] = value;
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
			}
		});
	},this);
}
CascadingObject.lastCommonParent = function(co1,co2) {
	if (co1.schema !== co2.schema) {
		throw new Error("Two objects with different schemas can never have a parent in common.");
	}
	var res = null;
	var co1Tree = co1.getInheritanceTree();
	var co2Tree = co2.getInheritanceTree();
	for (var i = 0; i < co1Tree.length; i++) {
		if (co2Tree.indexOf(co1Tree[i]) !== -1) {
			res = co1Tree[i];
			i = co1Tree.length;
		}
	}
	return res;
};
CascadingObject.union = function(createNew,arg1,arg2,leftPrecedence) {
	leftPrecedence = typeof leftPrecedence !== "undefined" ? leftPrecedence : false;
	var res;
	if (arg1.schema !== arg2.schema) {
		throw new Error("Cannot union two cascading objects with different schemas.");
	}
	var commonParent = CascadingObject.lastCommonParent(arg1,arg2);
	if (commonParent === null) {
		throw new Error("Arguments must share a common parent for a union to occur.");
	}
	var cpTree = commonParent.getInheritanceTree();
	if (cpTree.indexOf(arg1) !== -1) {
		// arg2 inherits from arg1
		res = arg2;
	} else if (cpTree.indexOf(arg2) !== -1) {
		// arg1 inherits from arg2
		res = arg1;
	} else {
		//res = new CascadingObject(arg1.schema,commonParent);
		res = createNew(arg1,arg2,commonParent);
		// for each key:
		// 	check definer for both arg1 and arg2
		// 	if both are in cpTree then skip
		// 	if only in one then use that one
		// 	if in both then use arg2
		var arg1Data;
		var arg2Data;
		var arg1InTree;
		var arg2InTree;
		arg1.schema.forEach(function(x,key) {
			// Because the schemas match, this also iterates over every key in arg2
			arg1Data = arg1.getMetadata(key);
			arg2Data = arg2.getMetadata(key);
			arg1InTree = cpTree.indexOf(arg1Data.definer) !== -1;
			arg2InTree = cpTree.indexOf(arg2Data.definer) !== -1;
			if (arg1InTree) {
				if (!arg2InTree) {
					// arg2 overrides, use that value
					res[key] = arg2Data.value;
				}
				// Else none overrides, so just keep the value from commonParent
			} else if (arg2InTree) {
				// arg1 overrides, use that value
				res[key] = arg1Data.value;
			} else {
				// Both override, use value determined by precedence argument
				res[key] = leftPrecedence ? arg1Data.value : arg2Data.value;
			}
		});
	}
	return res;
};
CascadingObject.multiUnion = function(createNew,args,leftPrecedence) {
	var res;
	if (args.length <= 0) {
		throw new Error("Cannot union an empty set.");
	} else {
		res = args[0];
		for (var i = 1; i < args.length; i++) {
			res = CascadingObject.union(createNew,res,args[i],leftPrecedence);
		}
	}
	return res;
};



