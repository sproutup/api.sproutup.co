'use strict';

/**
 * Module dependencies.
 */
var dynamoose = require('dynamoose');
var Contributor = dynamoose.model('Contributor');
var config = require('config/config');
var knex = require('config/lib/bookshelf').knex;
/* global -Promise */
var Promise = require('bluebird');
var Company = dynamoose.model('Company');
var Campaign = dynamoose.model('Campaign');
var errorHandler = require('modules/core/server/errors.controller');
var _ = require('lodash');
var sendgridService = require('modules/sendgrid/server/sendgrid.service');
var sendApprovedEmail = sendApprovedEmail;

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
    if(user){
      _item.user = user[0];
    }
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
  var _item;
  var _previousState;
  Contributor.get({userId: req.params.userId, campaignId: req.params.campaignId})
    .then(function(item){
      if(_.isUndefined(item)){
        return res.status(400).send({
          message: 'Contributor not found'
        });
      }
      return item;
  })
  .then(function(item){
    _previousState = item.state;
    _item = item;
    //For security purposes only merge these parameters
    // _.extend(item, _.pick(req.body, ['state','link','address','phone','comment','bid', 'trial.shippingState']));
    _.extend(item, req.body);
    return item.save();
  })
  .then(function(data){
    if ((_previousState === 0) && (_item.state === 1 || _item.state === '1')) {
      sendApprovedEmail(_item);
    }

    return data;
  })
  .then(function(data){
    res.json(_item);
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

var sendApprovedEmail = function(data) {
  var _campaign;

  return Campaign.get(data.campaignId).then(function(campaign) {
    _campaign = campaign;
    return Company.get(campaign.companyId);
  })
  .then(function(company) {
    var url = config.domains.mvp + _campaign.type + 's/' + _campaign.id;
    var substitutions = {
      ':campaign_name': [_campaign.name],
      ':campaign_url': [url],
      ':brand_name': [company.name],
      ':shipping_address': [data.address],
      ':phone_number': [data.phone]
    };

    sendgridService.sendToMvpUser(data.userId, 'You\'re request has been approved!', substitutions, config.sendgrid.templates.approved);
  })
  .catch(function(error) {
    console.log('approved email error: ', error);
  });
};