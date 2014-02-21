///
/// A simple View abstraction.
///
module.exports = SkyView

var dom     = require('./lib/shims/dom')
  , reTmpl  = /([<]\w+):(\w+)\b/g
  , reEvent = /^(?:(\S+)\s+)?(\w+)$/
  , reChar  = /([^\w])/g
  , SCOPE = 0, ID = 0

function SkyView(tmplOpts) {
  tmplOpts    = tmplOpts || {}
  this._scope = tmplOpts._scope = (SCOPE++).toString()
  this.el     = dom.create(template(this._template, tmplOpts))
  this._bindEvents()
  this.render(this.el)
  this._bindElements()
}

SkyView.shim     = function(_dom) { dom = _dom }
SkyView.template = template

SkyView.prototype._template    = ""
SkyView.prototype._events      = {} // {String type : [DelegatedEvent]}
SkyView.prototype._eventTypes  = [] // [String type]
SkyView.prototype._bindings    = {} // {String name : String ID}
SkyView.prototype._allBindings = [] // [String name]
SkyView.prototype._destroy     = [] // [Function]

SkyView.prototype.View = function(tmpl) {
  var constr   = this.constructor
    , proto    = constr.prototype
    , _super   = constr.super_.prototype
    , tmplStr  = tmpl === undefined       ? _super._template
               : typeof tmpl === "string" ? tmpl
               : template(_super._template, tmpl)
    , bindings = proto._bindings = {}

  tmplStr = tmplStr.replace(reTmpl, function(_, tag, bind) {
    var id = bindings[bind] = (ID++).toString()
    return tag + ' id="sv-{_scope}-' + id + '"'
  })
  proto._allBindings = Object.keys(bindings)
  proto._template    = tmplStr
  return new ViewBuilder(proto, _super)
}

SkyView.prototype.render = function() {} // override

// Remove the element.
SkyView.prototype.remove = function() { dom.remove(this.el) }

// Remove the element and clean up references
SkyView.prototype.destroy = function() {
  if (!this.el) return
  this._unbindElements()
  this.remove()
  this.el = null

  var onDestroys = this._destroy
  for (var i = 0; i < onDestroys.length; i++) {
    var fn = onDestroys[i]
    ;(typeof fn === "string" ? this[fn] : fn).call(this)
  }
}

// Process a DOM event by passing it off to the appropriate delegate.
SkyView.prototype._onDOMEvent = function(ev) {
  var delegates = this._events[ev.type]
    , target    = ev.target
  if (!delegates) return
  for (var i = 0; i < delegates.length; i++) {
    var delegate = delegates[i]
      , selector = delegate.selector
    if (selector === null || dom.is(target, selector)) {
      var fn = delegate.listener
      ;(typeof fn === "string" ? this[fn] : fn).call(this, ev)
    }
  }
}

// Attach events to the top-level element.
SkyView.prototype._bindEvents = function() {
  var eventTypes = this._eventTypes
    , _this      = this
  for (var i = 0; i < eventTypes.length; i++) {
    dom.on(this.el, eventTypes[i], onDOMEvent)
  }
  function onDOMEvent(ev) { _this._onDOMEvent(ev) }
}

SkyView.prototype._bindElements = function() {
  var allBindings = this._allBindings
    , bindingToID = this._bindings
  for (var i = 0; i < allBindings.length; i++) {
    var binding = allBindings[i]
    this[binding] = dom.find("sv-" + this._scope + "-" + bindingToID[binding])
  }
}

SkyView.prototype._unbindElements = function() {
  var allBindings = this._allBindings
  for (var i = 0; i < allBindings.length; i++) {
    this[allBindings[i]] = null
  }
}

///
/// View Builder
///

function ViewBuilder(proto, _super) {
  this.proto = proto
  this.super = _super
}

// events - {"<selector> <type>" : Function or String}
ViewBuilder.prototype.on = function(events) {
  this.proto._events     = mergeEvents(parseEvents(events), this.super._events)
  this.proto._eventTypes = Object.keys(this.proto._events)
  return this
}

// destroy - Function or String
ViewBuilder.prototype.destroy = function(onDestroy) {
  this.proto._destroy = this.super._destroy.concat(onDestroy)
  return this
}

///
/// Templating
///

//
// templateStr - String template: "<foo>{param}</foo>"
// params      - {String param : String value}
//
// Returns String.
function template(templateStr, params) {
  var paramNames = Object.keys(params)
  for (var i = 0; i < paramNames.length; i++) {
    var param   = paramNames[i]
      , paramRe = new RegExp(("{" + param + "}").replace(reChar, "[$1]"), "g")
    templateStr = templateStr.replace(paramRe, params[param])
  }
  return templateStr
}

///
/// Events
///

// origEvents - {"<selector> <event>": listener}
// Returns {"<event>" : [DelegatedEvent]}
function parseEvents(origEvents) {
  var evStrs = Object.keys(origEvents)
    , events = {}
  for (var i = 0; i < evStrs.length; i++) {
    var evStr = evStrs[i]
      , match = reEvent.exec(evStr)
      , event = match[2]

    if (!events[event]) events[event] = []
    events[event].push(new DelegatedEvent(match[1], origEvents[evStr]))
  }
  return events
}

function DelegatedEvent(selector, listener) {
  this.selector = selector || null
  this.listener = listener
}

///
/// Utilities
///

// obj   - { key : [DelegatedEvent foo] }
// extra - { key : [DelegatedEvent bar] }
// Mutates obj -> { key : [foo] ++ [bar] }
function mergeEvents(obj, extra) {
  var extraKeys = Object.keys(extra)
  for (var i = 0; i < extraKeys.length; i++) {
    var key    = extraKeys[i]
      , target = obj[key] || (obj[key] = [])
      , values = extra[key]
    for (var j = 0; j < values.length; j++) target.push(values[j])
  }
  return obj
}
