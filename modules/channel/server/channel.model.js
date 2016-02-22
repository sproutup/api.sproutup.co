'use strict';

/**
 * Module dependencies.
 */
var dynamoose = require('dynamoose');
var Schema = dynamoose.Schema;
var FlakeId = require('flake-idgen');
var flakeIdGen = new FlakeId();
var intformat = require('biguint-format');
var validator = require('validator');

/**
 * Schema
 */
var ChannelSchema = new Schema({
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
      name: 'ChannelUserIndex',
      project: true, // ProjectionType: ALL
      throughput: 5 // read and write are both 5
    }
  },
  refId: {
    type: String,
    required: false,
    index: {
      global: true,
      rangeKey: 'created',
      name: 'ChannelRefIdUserIdIndex',
      project: true, // ProjectionType: ALL
      throughput: 5 // read and write are both 5
    }
  },
  created: {
    type: Date,
    default: Date.now
  },
  title: {
    type: String,
    default: '',
    trim: true
  }
});

/**
 * Populate method
 */
ChannelSchema.method('populate', function (_schema) {
  var _this = this;
  var _attribute = _schema.toLowerCase() + 'Id';
  console.log('populate: ', _schema);
  var model = dynamoose.model(_schema);
  return model.get(this[_attribute]).then(function(item){
    _this[_schema.toLowerCase().trim()] = item;
    return _this;
  });
});

ChannelSchema.statics.createNewChannel = function(userId, refId, refType){
  console.log('create new channel');
  var _this = this;
  var Channel = dynamoose.model('Channel');
  var channel = new Channel({userId: userId});
  channel.save().then(function(val){
    _this.addMember();
  }).catch(function(err){

  });
};

ChannelSchema.method('addMember', function(userId, channelId){
  console.log('add member');
  return dynamoose.model('Channel').addMember(userId, channelId);
});

ChannelSchema.statics.addMember = function(userId, channelId){
  console.log('add member');
  var Member = dynamoose.model('Member');
  var item = new Member({userId: userId, channelId: channelId});
  return item.save();
};

dynamoose.model('Channel', ChannelSchema);
