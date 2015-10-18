var Model = Backbone.Model;

var previousToJSON = Backbone.Model.prototype.toJSON;

var previousSet = Backbone.Model.prototype.set;
var previousSave = Backbone.Model.prototype.save;

/**
 * Replacement for Backbone.Model. Supports a global track point.
 *
 * @class Backbone.Model
 * @extends Backbone.Model
 */
Backbone.Model = Backbone.Model.extend({

	/**
	 * @property {string} [cidAttribute="cid"] The attribute to store
	 * the cid in for lookup.
	 */
  cidAttribute: 'cid',

	constructor: function () {
		// The constructor is defined for ensuring to create
		// the instance without loosing neither the initialization
		// logic required by this library nor customized by the user.
		if(this.initialize !== Backbone.Model.prototype.initialize) {
			var self = this;
			var overridedInit = this.initialize;

			// Composes new initialize method that contains
			// both library and customized initialize method
			this.initialize = _.wrap(Backbone.Model.prototype.initialize, function(backboneInit) {
				backboneInit.call(self, arguments[2]);
				overridedInit.call(self, arguments[2]);
			});
		}

		return Model.apply(this, arguments);
  },

  initialize: function () {
  	var self = this;

  	this._fetched = false;
  	this.dirtied = {};
  	this._dirtyDestroyed = false;
  	this._destroyed = false;

    // Saving dirty attributes
    _.extend(this.dirtied, _.omit(this.attributes, [this.idAttribute, this.cidAttribute]));

		// Use `"cid"` for retrieving models by `attributes.cid`.
		this.set(this.cidAttribute, this.cid);

		var ctor = this.constructor;

		// Add the model to `all`.
		ctor.all().add(this);

		// On destroying the model it is marked
		this.on("destroy", function(model) {
			model._dirtyDestroyed = true;
		});
	},

	/**
	 * @property {boolean} [_fetched="false"] Flag that means if the model
	 * has been fetched remotely.
	 */
	_fetched: false,

	/**
	 * @return {boolean} 'true' if this model has been fetched remotely,
	 * 'false' otherwise
	 */
	isFetched: function () {
		return this._fetched;
	},

	/**
	 * @property {Object} [dirtied] Internal hash containing all
	 * attributes that have changed since its last server synchronization.
	 */
	dirtied: {},

	/**
	 * @return {Object} [dirtiedAttributes] Retrieve a copy of the attributes that have
	 * changed since the last server synchronization.
	 */
	dirtiedAttributes: function() {
		return _.clone(this.dirtied);
	},

	/**
	 * @param {Array.<String>} [attr] The attribute to check if has been changed.
	 * @return {boolean} 'true' in case the model changed since its last sever
	 * synchronization, 'false' otherwise
	 */
	hasDirtied: function (attr) {
		if (attr == null) return !_.isEmpty(this.dirtied);
		return _.has(this.dirtied, attr);
	},

	/**
	 * @property {boolean} [_dirtyDestroyed="false"] Flag that means if the model
	 * has been destroyed locally.
	 */
	_dirtyDestroyed: false,

	/**
	 * @return {boolean} 'true' if this model has been destroyed locally,
	 * 'false' otherwise
	 */
	isDirtyDestroyed: function () {
		return this._dirtyDestroyed;
	},

	set: function(key, val, options) {
		if (key == null) return this;

		var attrs;
		if (typeof key === 'object') {
			attrs = key;
			options = val;
		} else {
			(attrs = {})[key] = val;
		}

		options || (options = {});

		previousSet.call(this, attrs, options);

		if(!options.mode || options.mode === "client") {
			_.extend(this.dirtied, _.omit(attrs, [this.idAttribute, this.cidAttribute]));
		}

		return this;
    },

	/**
	 * @property {boolean} [_destroyed="false"] Flag that means if the model
	 * has been destroyed remotely.
	 */
	_destroyed: false,

	/**
	 * @return {boolean} 'true' if this model has been destroyed remotely,
	 * 'false' otherwise
	 */
	isDestroyed: function () {
		return this._destroyed;
	},

	/**
	 * Alters save method to include changes being set as an option
	 * for the Syncer method.
	 */
	save: function(key, val, options) {
		var attrs;
		if (key == null || typeof key === 'object') {
			attrs = key;
			options = val;
		} else {
			(attrs = {})[key] = val;
		}

		options || (options = {});

    if(options.patch) {
      options.changes = attrs;
    } else {
      options.changes = _.extend(_.clone(this.attributes), attrs);
    }

		return previousSave.apply(this, [key, val, options]);
	},

	/**
	 * Fetches the model if it has not been fetched before.
	 *
	 * @param {Object} [options]
	 * @return {Object} xhr
	 */
	pull: function(options) {
		options || (options = {});
		return this.fetch(_.extend(options, {mode: "infinite"}));
	},

	/**
	 * Pushes the changes performed to the model; create, update
	 * or destroy.
	 *
	 * @param {Object} [options]
	 * @return {Object} xhr
	 */
	push: function(options) {
		options || (options = {});
		var options = _.extend(options, {mode: "server"});

		if(this.isDirtyDestroyed()) {
      // Model is marked as destroyed, but in case is new, it won't be synchronized.
      if(this.isNew()) return;
			return this.destroy(options);
		} else if(this.isNew()) {
      // Model is new, it will be created remotelly.
			return this.save({}, options);
		} else if(this.hasDirtied()) {
      // Model has dirtied changes, it will be updated remotelly.
			return this.save(this.dirtiedAttributes(), options);
		}
	}

}, {

	/**
	 * Factory method that returns a model instance and
	 * ensures only one is gonna be created with same id.
	 *
	 * @param {Object} [attrs] Attributes for the new instance.
	 * @param {Object} [options] Options for the new instance.
	 */
	create: function (attrs, options) {
		options || (options = {});

		var id = attrs && attrs[this.prototype.idAttribute];

		var model = this.find(attrs);

		// If found by id, modify and return it.
		if(model) {

			// Modifies only if `attrs` does not reference to an existing model.
			if(attrs !== model.attributes) {
				model.set(model.parse(attrs), _.extend(options, {silent: false}));

				return model;
			}

			// Makes validations if required by options
			if(options.validate)
				model._validate({}, options);

			return model;
		}

		// Ensure attributes are parsed.
		options.parse = true;

		return new this(attrs, options);
	},

	/**
	 * Returns a model by its id or cid from the local cache
	 * of the model.
	 *
	 * @param {Object} [attrs] An id or cid for looking up.
	 */
	find: function (attrs){
		if (!attrs) return false;

		var cid = attrs[this.prototype.cidAttribute];
		var id = attrs[this.prototype.idAttribute];

		return (cid || id) && this.all().get(cid || id) || false;
	},

	/**
	 * Returns the collection that represents the local cache
	 * of the model.
	 */
	all: function () {
		if(!this._all) {
			var Constructor = this;
			var All = Backbone.Collection.extend({
				model: Constructor
			});

			var all = this._all = new All();

			all.on("destroy", function(model) {
				if(model.isDirtyDestroyed() && !model.isDestroyed())
					all.add(model, {silent: true});
			});
		}

		return this._all;
	},

	/**
	 * Resets the local cache of the model.
	 */
	reset: function () {
		this.all().reset();
	}
});

Backbone.Collection = Backbone.Collection.extend({});

var serverSync = Backbone.sync;

var Syncer = {};
Syncer.sync = function (method, model, options) {
  options || (options = {});

  options.method = method;

  options.mode || (options.mode = 'server');

  if(model instanceof Backbone.Model) {
    return modelSync.apply(this, [method, model, options]);
  } else if(model instanceof Backbone.Collection) {
    return collectionSync.apply(this, [method, model, options]);
  }

}

function modelSync(method, model, options) {
  var mode = options.mode;

  switch(method) {
    case "create":
    case "update":
    case "patch":
      var success = options.success;

      if(mode === "client") {
        // Client mode.
        _.defer(success, model, {}, options);
        return;
      }

      // Server mode.
      options.success = function (response) {
        // Marks the model as fetched in case it is a new one.
        if(method === "create") {
          model._fetched = true;
        }

        // Resolves attributes marked as dirtied.
        _.each(options.changes, function (attrVal, attrKey) {
          var dirtiedVal = model.dirtied[attrKey];

          if(dirtiedVal === attrVal)
            delete model.dirtied[attrKey];
        });

        if(success) success.call(options.context, response);
      };

      return serverSync.apply(this, [method, model, options]);

    case "delete":
      var success = options.success;

      if(mode === "client") {
        // Client mode.
        _.defer(success, model, {}, options);
        return;
      }

      // Server mode.
      options.success = function (response) {
        if(mode === "server") {
          model.constructor.all().remove(model);
          model._destroyed = true;
        }

        if(success) success(options.context, response);
      };

      return serverSync.apply(this, [method, model, options]);

    case "read":
      var success = options.success;

      if(mode === "infinite") {
        // Infinite mode.
        if(model.isFetched()) {
          // Model already fetched.
          _.defer(success, model, {}, options);
          return;
        }
      }

      // Server mode & infinite mode with the model not fetched.
      options.success = function (response) {
        model._fetched = true;

        if(success) success(options.context, response);
      };

      return serverSync.apply(this, [method, model, options]);

  }
}

function collectionSync(method, collection, options) {
  var mode = options.mode;

  switch(method) {
    case "create":
    case "update":
    case "patch":
      break;
    case "delete":
      break;
    case "read":
      break;
  }
}

Backbone.sync = Syncer.sync;
