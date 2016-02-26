'use strict';

/**
 * Module dependencies.
 */
/* global -Promise */
var Promise = require('bluebird');

var dynamoose = require('dynamoose');
var Schema = dynamoose.Schema;
var FlakeId = require('flake-idgen');
var flakeIdGen = new FlakeId();
var intformat = require('biguint-format');
var validator = require('validator');

/**
 * Schema
 */
var PostSchema = new Schema({
  id: {
    type: String,
    default: function(){ return intformat(flakeIdGen.next(), 'dec'); },
    hashKey: true
  },
  userId: {
    type: String,
    required: true,
    index: {
      global: true,
      rangeKey: 'created',
      name: 'PostUserIndex',
      project: true, // ProjectionType: ALL
      throughput: 5 // read and write are both 5
    }
  },
  groupId: {
    type: String,
    required: false,
    index: {
      global: true,
      rangeKey: 'created',
      name: 'PostGroupIdCreatedIndex',
      project: true, // ProjectionType: ALL
      throughput: 5 // read and write are both 5
    }
  },
  created: {
    type: Date,
    default: Date.now
  },
  body: {
    type: String,
    default: '',
    trim: true,
    required: true
  }
});

/**
 * Populate method
 */
PostSchema.methods.populate = Promise.method(function (_schema) {
  var _this = this;

  var _attribute = _schema.toLowerCase() + 'Id';
  if (!this[_attribute]) return null;

  console.log('populate: ', _schema);
  var model = dynamoose.model(_schema);
  return model.get(this[_attribute]).then(function(item){
    _this[_schema.toLowerCase().trim()] = item;
    return _this;
  });
});

/**
 * Populate method for posts
 */
PostSchema.method('populateRef', function (_schema, _id) {
  var _this = this;
  console.log('populate: ', _schema);
  var model = dynamoose.model(_schema);
  return model.query('refId').eq(this.id).exec().then(function(items){
    _this[_schema.toLowerCase().trim()] = items;
    return _this;
  });
});

dynamoose.model('Post', PostSchema);

