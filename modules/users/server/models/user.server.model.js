'use strict';

/**
 * Module dependencies.
 */
 /* global -Promise */
var Promise = require('bluebird');
var _ = require('lodash');
var debug = require('debug')('up:debug:user:model');
var cache = require('config/lib/cache');
var dynamoose = require('dynamoose'),
  Schema = dynamoose.Schema,
  crypto = require('crypto'),
  FlakeId = require('flake-idgen'),
  flakeIdGen = new FlakeId(),
  intformat = require('biguint-format'),
  validator = require('validator');

/**
 * A Validation function for local strategy properties
 */
var validateLocalStrategyProperty = function (property) {
  return ((this.provider !== 'local' && !this.updated) || property.length);
};

/**
 * A Validation function for local strategy password
 */
var validateLocalStrategyPassword = function (password) {
  return (this.provider !== 'local' || validator.isLength(password, 6));
};

/**
 * A Validation function for local strategy email
 */
var validateLocalStrategyEmail = function (email) {
  return ((this.provider !== 'local' && !this.updated) || validator.isEmail(email));
};

/**
 * User Schema
 */
var UserSchema = new Schema({
  id: {
    type: String,
    default: function(){ return intformat(flakeIdGen.next(), 'dec'); },
    hashKey: true
  },
  username: {
    type: String,
    // required: true,
    trim: true,
  },
  firstName: {
    type: String,
    trim: true,
    required: true,
    default: '',
    validate: validateLocalStrategyProperty
  },
  lastName: {
    type: String,
    trim: true,
    default: '',
    validate: validateLocalStrategyProperty
  },
  displayName: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  address: {
    type: String
  },
  phone: {
    type: String
  },
  email: {
    type: String,
    trim: true,
    default: '',
    validate: validateLocalStrategyEmail,
    index: {
      global: true,
      project: true,
      name: 'emailGlobalIndex'
    }
  },
  password: {
    type: String,
    default: '',
    validate: validateLocalStrategyPassword
  },
  salt: {
    type: String
  },
  hash: {
    type: String
  },
  avatar: {
    fileId: {
      type: String
    }
  },
  profileImageURL: {
    type: String,
    default: 'modules/core/client/img/default-avatar.png'
  },
  provider: {
    type: String,
    required: 'Provider is required'
  },
  providerData: {},
  additionalProvidersData: {},
  roles: {
    type: [{
      type: String,
      enum: ['user', 'admin']
    }],
    default: ['user']
  },
  updated: {
    type: Date
  },
  created: {
    type: Date,
    default: Date.now
  },
  emailConfirmed: {
    type: Boolean,
    default: false
  }
});

/**
 * Create instance method for hashing a password
 */
UserSchema.method('hashPassword', function (password) {
  if (this.salt && password) {
    return crypto.pbkdf2Sync(password, new Buffer(this.salt, 'base64'), 10000, 64).toString('base64');
  } else {
    return password;
  }
});


/**
 * Create static method for hashing a password
 */
UserSchema.static('hashPassword', function (password, salt) {
  if (salt && password) {
    return crypto.pbkdf2Sync(password, new Buffer(salt, 'base64'), 10000, 64).toString('base64');
  } else {
    return password;
  }
});

/**
 * Create instance method for authenticating user
 */
UserSchema.method('populate', function (path) {
  var _this = this;
  console.log('populate: ', path);
  return _this;
});


/**
 * Create instance method for authenticating user
 */
UserSchema.method('authenticate', function (password) {
  return this.hash === this.hashPassword(password);
});

/**
 * Find possible not used username
 */
UserSchema.statics.findUniqueUsername = function (username, suffix, callback) {
  var _this = this;
  var possibleUsername = username + (suffix || '');

  _this.queryOne({
    username: possibleUsername
  }, function (err, user) {
    if (!err) {
      if (!user) {
        callback(possibleUsername);
      } else {
        return _this.findUniqueUsername(username, (suffix || 0) + 1, callback);
      }
    } else {
      callback(null);
    }
  });
};

UserSchema.statics.findEmail = function (email, callback) {
  var _this = this;

  _this.query('email').eq(email).limit(1).exec(function(err, user){
    console.log('user:', user);
    console.log('err:', err);
    return true;
  });
};

UserSchema.statics.getPopulated = Promise.method(function(id){
  var User = dynamoose.model('User');
  var File = dynamoose.model('File');
  var key = 'user:' + id;
  var _item;

  return User.get(id).then(function(item){
    if(_.isUndefined(item)) return null;
    _item = item;
    if(!item.avatar){
      return null;
    }
    else{
      return File.getCached(item.avatar.fileId);
    }
  }).then(function(file){
    if(file){
      _item.avatar.file = file;
    }
    return _item;
  }).catch(function(err){
    return null;
  });
});

UserSchema.statics.getCached = Promise.method(function(id){
  var User = dynamoose.model('User');
  var File = dynamoose.model('File');
  var key = 'user:' + id;
  var _item;

  return cache.wrap(key, function() {
    console.log('cache miss: ', key);
    return User.get(id).then(function(item){
      if(_.isUndefined(item)) return null;
      _item = item;
      if(!item.avatar){
        return null;
      }
      else{
        return File.getCached(item.avatar.fileId);
      }
    }).then(function(file){
      if(file){
        _item.avatar.file = file;
      }
      return _item;
    }).catch(function(err){
      return null;
    });
  });
});

UserSchema.static('createWithSlug', Promise.method(function(body) {
  var Slug = dynamoose.model('Slug');
  var User = dynamoose.model('User');
  body.id = intformat(flakeIdGen.next(), 'dec');

  if (body.password) {
    body.salt = crypto.randomBytes(16).toString('base64');
    body.hash = User.hashPassword(body.password, body.salt);
    body.password = '';
  }

  return Slug.createWrapper({id: body.username, refId: body.id, refType: 'User'}).then(function(slug){
    debug('slug: ', slug);
    return User.create(body).then(function(item){
      debug('user: ', item);
      return item;
    });
  }).catch(function(err){
    debug('err', err.stack);
    throw err;
  });
}));



var UserModel = dynamoose.model('User', UserSchema);

/**
 * Hook a pre save method to hash the password
 * /
UserModel.pre('save', function validate (next) {
  debug('user pre save');
  if (this.password) {
    this.salt = crypto.randomBytes(16).toString('base64');
    this.hash = this.hashPassword(this.password);
    this.password = '';
  }
//  console.log('pre save: ', this.email);
  // new user check email
/*  if (!this.id){
    User.queryOne('email').eq(this.email).exec(function(err, user){
      if(err) {
        next(err);
      } else if(user) {
        console.log('found email: ', user.email);
        this.email = null;
        next(new Error("username must be unique"));
      } else {
        console.log('check email: ', user);
        next();
      }
    });
  } * /
  next();
});
*/

exports = UserSchema;
