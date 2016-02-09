'use strict';

/**
 * Module dependencies.
 */
var dynamoose = require('dynamoose');
var Contributor = dynamoose.model('Contributor');
var knex = require('config/lib/bookshelf').knex;
/* global -Promise */
var Promise = require('bluebird');
var Campaign = dynamoose.model('Campaign');
var errorHandler = require('modules/core/server/errors.controller');
var _ = require('lodash');

/**
 * Show
 */
exports.read = function (req, res) {
  var _item;
  Contributor.get({userId: req.params.userId, campaignId: req.params.campaignId})
    .then(function(item){
      if(_.isUndefined(item)){
        return res.status(400).send({
          message: 'Contributor not found'
        });
      }
      _item = item;
  })
  .then(function(){
    return knex
      .select('id','name','email', 'description')
      .from('users')
      .where('id', _item.userId);
  })
  .then(function(user){
    console.log('user', user);
    _item.user = user;
    return;
  })
  .then(function(){
    Campaign.get(_item.campaignId).then(function(campaign){
      _item.campaign = campaign;
      res.json(_item);
    });
  })
  .catch(function(err){
    return res.json(err);
  });
};

/**
 * Create
 */
exports.create = function (req, res) {
  var item = new Contributor(req.body);

  item.save(function (err) {
    if (err) {
      return res.status(400).send({
        message: errorHandler.getErrorMessage(err)
      });
    } else {
      res.json(item);
    }
  });
};

/**
 * Update
 */
exports.update = function (req, res) {
  var item = req.model;

  //For security purposes only merge these parameters
  item.status = req.body.status;

  item.save().then(function(data){
    res.json(item);
  })
  .catch(function (err) {
    return res.status(400).send({
      message: errorHandler.getErrorMessage(err)
    });
  });
};

/**
 * Delete
 */
exports.delete = function (req, res) {
  var item = req.model;

  Contributor.delete({userId: req.params.userId, campaignId: req.params.campaignId}).then(function(result){
    res.json(item);
  })
  .catch(function (err) {
    if (err) {
      return res.status(400).send({
        message: errorHandler.getErrorMessage(err)
      });
    }
  });
};

/**
 * List
 */
exports.list = function (req, res) {
  Contributor.scan().exec().then(function(items){
    res.json(items);
  })
  .catch(function(err){
    return res.status(400).send({
      message: errorHandler.getErrorMessage(err)
    });
  });
};

/**
 * List by campaign
 */
exports.listByCampaign = function (req, res) {
  Contributor.query({campaignId: req.model.id})
    .exec().then(function(items){
      return Promise.map(items, function(val){
        return knex
          .select('id','name','nickname','email','description')
          .from('users')
          .where('id', val.userId).then(function(user){
            if(user.length>0){
              val.user = user[0];
            }
            return val;
          });
      })
      .catch(function(err){
        console.log('err: ', err);
        throw err;
      });
    })
  .then(function(items){
    res.json({
      status: 'ok',
      campaign: req.model,
      items: items
    });
  })
  .catch(function(err){
    return res.status(400).send({
      message: errorHandler.getErrorMessage(err)
    });
  });
};

/**
 * List by user
 */
exports.listByUser = function (req, res) {
  var contributions = null;
  var campaigns = null;
  Contributor.query({userId: req.params.userId}).exec().then(function(items){
    contributions = items;
    if(items.length>0){
      var query = _.map(items, function(val){ return {id: val.campaignId}; });
      return Campaign.batchGet(query);
    }
    else{
      return [];
    }
  })
  .then(function(items){
    campaigns = items;
    _.forEach(contributions, function(val){
      val.campaign = _.find(campaigns, 'id', val.campaignId);
    });
    res.json(contributions);
  })
  .catch(function(err){
    console.log(err);
    return res.status(400).send({
      message: errorHandler.getErrorMessage(err)
    });
  });
};


/**
 * middleware
 */
exports.findByID = function (req, res, next, id) {
  if (!_.isString(id)) {
    return res.status(400).send({
      message: 'Contributor is invalid'
    });
  }

  Contributor.get(id).then(function(item){
    if(_.isUndefined(item)){
      return res.status(400).send({
        message: 'Contributor not found'
      });
    }

    req.model = item;
    next();
  })
  .catch(function(err){
    return next(err);
  });
};
