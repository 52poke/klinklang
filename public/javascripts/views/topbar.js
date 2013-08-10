define([
  'zepto'
  ,'underscore'
  ,'backbone'
], function($, _, Backbone, topBarTemplate){

  var TopBar = Backbone.View.extend({
    el: '#top-bar'

    ,events: {
      'click a:not(.external)': 'navigate'
    }

    ,render: function(){
      return this;
    }

    ,update: function(route){
      this.$('li.active').removeClass('active');
      this.$('a[data-route="' + route + '"]')
      .closest('li').addClass('active');
    }

    ,navigate: function(e){
      e.preventDefault();
      Backbone.history.navigate(e.target.pathname, {trigger: true});
    }
  });

  return TopBar;
});