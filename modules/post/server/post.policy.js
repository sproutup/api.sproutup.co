'use strict';

/**
 * Module dependencies.
 */
var acl = require('acl');

// Using the memory backend
acl = new acl(new acl.memoryBackend());

/**
 * Invoke Permissions
 */
exports.invokeRolesPolicies = function () {
  acl.allow([{
    roles: ['admin'],
    allows: [{
      resources: '/api/post',
      permissions: '*'
    }, {
      resources: '/api/post/:postId',
      permissions: '*'
    }]
  }, {
    roles: ['user'],
    allows: [{
      resources: '/api/post',
      permissions: ['get', 'post']
    }, {
      resources: '/api/post/:postId',
      permissions: ['*']
    }, {
      resources: '/api/post/timeline/all',
      permissions: ['*']
    }, {
      resources: '/api/post/timeline/all/:index',
      permissions: ['*']
    }, {
      resources: '/api/post/timeline/group/:groupId/:index',
      permissions: ['*']
    }, {
      resources: '/api/post/timeline/user/:userId/:index',
      permissions: ['*']
    }]
  }, {
    roles: ['guest'],
    allows: [{
      resources: '/api/post',
      permissions: ['*']
    }, {
      resources: '/api/post/:postId',
      permissions: ['*']
    }, {
      resources: '/api/post/timeline/all',
      permissions: ['*']
    }, {
      resources: '/api/post/timeline/all/:index',
      permissions: ['*']
    }, {
      resources: '/api/post/timeline/group/:groupId/:index',
      permissions: ['*']
    }, {
      resources: '/api/post/timeline/user/:userId/:index',
      permissions: ['*']
    }]
  }]);
};

/**
 * Check If Policy Allows
 */
exports.isAllowed = function (req, res, next) {
  var roles = (req.user) ? req.user.roles : ['guest'];

  // If an post is being processed and the current user created it then allow any manipulation
  if (req.product && req.user && req.post.user.id === req.user.id) {
    return next();
  }

  // Check for user roles
  acl.areAnyRolesAllowed(roles, req.route.path, req.method.toLowerCase(), function (err, isAllowed) {
    if (err) {
      // An authorization error occurred.
      return res.status(500).send('Unexpected authorization error');
    } else {
      if (isAllowed) {
        // Access granted! Invoke next middleware
        return next();
      } else {
        return res.status(403).json({
          message: 'User is not authorized'
        });
      }
    }
  });
};
