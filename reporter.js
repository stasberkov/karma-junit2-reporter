var fs = require('fs');
var path = require('path'); // Added for path manipulation

function JUnit2Reporter(logger, config) {
  var _log = logger.create('report');
  var _browsers = null;
  var _tests = null;
  var _startTime = new Date();

  // JUnit report configuration
  var junitConfig = {
    outputFile: (config && config.outputFile) || 'junit-results.xml',
    outputDir: (config && config.outputDir) || '',
    classNameFormat: (config && config.classNameFormat) || '{browser}.{suite}'
  };

  /* ======================================================================== */
  /* INTERNAL FUNCTIONS                                                       */
  /* ======================================================================== */

  function forBrowser(browser) {
    if (_browsers[browser.id]) return _browsers[browser.id];
    return _browsers[browser.id] = {
      "name": browser.name,
      "successes": 0,
      "failures": 0,
      "skipped": 0,
      "total": 0,
      "log": []
    };
  }

  function getElapsedTime() {
    var msec = (new Date() - _startTime);
    var hh = Math.floor(msec / 1000 / 60 / 60);
    msec -= hh * 1000 * 60 * 60;
    var mm = Math.floor(msec / 1000 / 60);
    msec -= mm * 1000 * 60;
    var ss = Math.floor(msec / 1000);
    msec -= ss * 1000;
    return mm * 60 + ss + (msec / 1000);
  }

  // Function to escape XML special characters
  function escapeXml(string) {
    return string
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Format class name according to configuration
  function formatClassName(browser, suite) {
    var className = junitConfig.classNameFormat;
    className = className.replace('{browser}', browser.name.replace(/\s+/g, '_'));
    className = className.replace('{suite}', suite.join('.'));
    return className;
  }

  // Generate JUnit XML report
  function generateJUnitXml() {
    var xmlLines = [];
    var totalTime = getElapsedTime();

    xmlLines.push('<?xml version="1.0" encoding="UTF-8" ?>');
    xmlLines.push('<testsuites>');

    // Process each browser
    for (var browserId in _browsers) {
      var browser = _browsers[browserId];

      // Process test results for this browser
      processTestsForBrowser(browser, '', _tests, xmlLines);
    }

    xmlLines.push('</testsuites>');
    return xmlLines.join('\n');
  }

  // Process tests recursively for a browser
  function processTestsForBrowser(browser, suitePath, testNode, xmlLines) {
    if (!testNode) return;

    // Process suites
    if (testNode.suites) {
      var suiteNames = Object.keys(testNode.suites);

      for (var i in suiteNames) {
        var suiteName = suiteNames[i];
        var newPath = suitePath ? suitePath + '.' + suiteName : suiteName;
        var suitePathArray = newPath.split('.');

        // Process suite
        processSuite(browser, suitePathArray, testNode.suites[suiteName], xmlLines);
      }
    }
  }

  // Process a single test suite
  function processSuite(browser, suitePath, suite, xmlLines) {
    if (!suite.results || Object.keys(suite.results).length === 0) {
      // Process nested suites if no tests at this level
      processTestsForBrowser(browser, suitePath.join('.'), suite, xmlLines);
      return;
    }

    var suiteName = suitePath[suitePath.length - 1];
    var className = formatClassName(browser, suitePath);
    var suiteFailures = 0;
    var suiteSkipped = 0;
    var suiteTests = 0;
    var testcases = [];

    // Process test cases
    var testResults = Object.keys(suite.results);
    for (var i in testResults) {
      var testName = testResults[i];
      var result = suite.results[testName];

      suiteTests += result.total;
      suiteFailures += result.failures;
      suiteSkipped += result.skipped;

      var testcase = '\t\t<testcase classname="' + escapeXml(className) +
        '" name="' + escapeXml(testName) + '"' +
        (result.time ? ' time="' + (result.time / 1000) + '"' : '') + '>';

      if (result.skipped) {
        testcase += '\n\t\t\t<skipped />\n\t\t';
      } else if (result.failures > 0) {
        testcase += '\n\t\t\t<failure>' +
          (result.log ? escapeXml(result.log.join('\n')) : 'Test failed') +
          '</failure>\n\t\t';
      }

      testcase += '</testcase>';
      testcases.push(testcase);
    }

    // Create testsuite element
    var testsuite = '\t<testsuite name="' + escapeXml(suiteName) + '" ' +
      'tests="' + suiteTests + '" ' +
      'failures="' + suiteFailures + '" ' +
      'skipped="' + suiteSkipped + '" ' +
      'timestamp="' + new Date().toISOString() + '" ' +
      'time="' + getElapsedTime() + '">\n';

    xmlLines.push(testsuite);
    xmlLines.push(testcases.join('\n'));
    xmlLines.push('\t</testsuite>');

    // Process nested suites
    processTestsForBrowser(browser, suitePath.join('.'), suite, xmlLines);
  }

  // Ensure directory exists
  function ensureDirectoryExists(directory) {
    if (directory && !fs.existsSync(directory)) {
      try {
        fs.mkdirSync(directory, { recursive: true });
      } catch (error) {
        _log.error('Failed to create directory: ' + directory);
        _log.error(error);
        return false;
      }
    }
    return true;
  }

  // Write JUnit XML report to file
  function writeJUnitReport() {
    var xml = generateJUnitXml();
    var outputPath;

    // Determine the output path
    if (junitConfig.outputDir) {
      // Create directory if it doesn't exist
      if (!ensureDirectoryExists(junitConfig.outputDir)) {
        return;
      }
      outputPath = path.join(junitConfig.outputDir, junitConfig.outputFile);
    } else {
      outputPath = junitConfig.outputFile;
    }

    try {
      fs.writeFileSync(outputPath, xml);
      _log.info('JUnit report written to: ' + outputPath);
    } catch (error) {
      _log.error('Could not write JUnit report to: ' + outputPath);
      _log.error(error);
    }
  }

  /* ======================================================================== */
  /* RUN START/COMPLETE                                                       */
  /* ======================================================================== */

  this.onRunStart = function (browsers) {
    _browsers = {};
    _tests = { suites: {} };
  };

  this.onRunComplete = function (browsers, results) {
    // Write JUnit report
    writeJUnitReport();
  };

  /* ======================================================================== */
  /* BROWSER START/LOG/ERROR                                                  */
  /* ======================================================================== */

  this.onBrowserStart = function (browser) {
    // Just initialize browser data, no logging
  };

  this.onBrowserLog = function (browser, message, level) {
    // Keep track of log messages for potential failure reports
    if (level == 'log') level = 'info';
    forBrowser(browser).log.push({ level: level, message: message });
  };

  this.onBrowserError = function (browser, error) {
    // Log errors to the file
    logger.create(browser.name).error(error);
  };

  this.onSpecComplete = function (browser, result) {
    var tests = _tests;
    var b = forBrowser(browser);

    for (var i in result.suite) {
      var suiteName = result.suite[i];
      if (!tests.suites) tests.suites = {};
      if (!tests.suites[suiteName]) tests.suites[suiteName] = {};
      tests = tests.suites[suiteName];
    }

    if (!tests.results) tests.results = {};
    if (!tests.results[result.description]) {
      tests.results[result.description] = {
        "successes": 0,
        "failures": 0,
        "skipped": 0,
        "total": 0
      };
    }
    var results = tests.results[result.description];

    b.total++;
    results.total++;

    if (result.skipped) {
      b.skipped++;
      results.skipped++;
    } else if (result.success) {
      b.successes++;
      results.successes++;
    } else {
      b.failures++;
      results.failures++;
      // Store the log for the JUnit report
      results.log = result.log;
    }

    // Save test execution time for JUnit report
    results.time = result.time;
  };

  this.adapters = [];
}

/* ========================================================================== */
/* MODULE DECLARATION                                                         */
/* ========================================================================== */

JUnit2Reporter.$inject = ['logger', 'config.junit2Reporter'];

module.exports = {
  'reporter:junit2': ['type', JUnit2Reporter]
};