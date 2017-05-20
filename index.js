var http = require('http');
var util = require('util');
var fs = require('fs');
var r = require('request');
var df = require('dateformat');
var gm = require('gm');
var async = require('async');


var infoEndpoint = 'http://himawari8-dl.nict.go.jp/himawari8/img/D531106/latest.json';



http.createServer((req, res) => {
  requestLatestEarthImage((err, result) => {
    if(err) {
      res.writeHead(500);
      res.end(err.message);
    } else {
      res.writeHead(200, {
        'content-type': 'image/png'
      });
      res.end(fs.readFileSync(result));
    }
  });
}).listen(8080);

const getLatestInfo = (url, cb) => {
  r(url, (err, res, body) => {
    if(!err && res.statusCode == 200) {
      const info = JSON.parse(body);
      var latestDate = Date.parse(info.date);
      var d = new Date(latestDate);
      return cb(null, d);
    } else {
      return cb(new Error('Unable to retrieve info. Try again later.'));
    }
  });
};

const buildBaseRequestUrl = (latestDate) => {
  const base = 'http://himawari8-dl.nict.go.jp/himawari8/img/D531106';
  const dateFormatString = 'yyyy/mm/dd/HHMMss';
  const dateString = df(latestDate, dateFormatString);
  const width = 550;
  const level = '4d';
  //base / level / width / date
  const formatString = '%s/%s/%s/%s';
  return util.format(formatString, base, level, width, dateString);
};

const buildTileUrl = (base, x, y) => {
  // base / x / y / .png
  return util.format('%s_%s_%s.png', base, x, y);
};

const requestTile = (tileUrl, imagePath, cb) => {
  r(tileUrl)
    .pipe(fs.createWriteStream(imagePath))
    .on('close', () => {
      return cb();
    })
    .on('error', (e) => {
      return cb(e);
    });
};

const requestLatestEarthImage = (cb) => {
  getLatestInfo(infoEndpoint, (err, latestDate) => {
    const baseUrl = buildBaseRequestUrl(latestDate);
    var tileTasks = [];
    for(var x = 0; x < 4; x++) {
      var tileRow = [];
      for(var y = 0; y < 4; y++) {
        var tileUrl = buildTileUrl(baseUrl, x, y);
        var tilePath = util.format('%s_%s.png', x, y);
        tileRow.push({url: tileUrl, path: tilePath});
      }
      tileTasks.push(buildDownloadTask(tileRow, x));
    }

    async.parallel(tileTasks, (err, result) => {
      if(err) {
        return cb(err);
      } else {
        var gmo = null;
        result.forEach((r) => {
          if(!gmo) {
            gmo = gm(r);
          } else {
            gmo.append(r, true);
          }
        });

        gmo.write('composite.png', (err) => {
          if(err) {
            return cb(err);
          } else {
            return cb(null, 'composite.png');
          }
        });  
      }
    }); 
    
  });
};

const buildDownloadTask = (row, idx) => {
  return (cb) => {
    async.map(row, (item, callback) => {
      requestTile(item.url, item.path, (err) => {
          if(err) {
            callback(err);
          } else {
            callback(null, item.path);
          }
        });
    }, (err, results) => {
      var gmo = null;
      results.forEach((tp) => {
        if(!gmo) {
          gmo = gm(tp);
        } else {
          gmo.append(tp);
        }
      }); 

      gmo.write(idx +'.png', (err) => {
        if(err) {
          return cb(err);
        } else {
          return cb(null, idx + '.png');
        }
      });
    });
  }
};