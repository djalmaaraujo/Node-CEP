/*jslint node: true */
"use strict";

/*
var resultadoCEP = {
    'uf'                : 'SP',
    'cidade'            : 'Jacareí',
    'bairro'            : 'Cidade Salvador',
    'tipo_logradouro'   : 'Rua',
    'logradouro'        : 'Mabito Shoji',
    'resultado'         : '1',
    'resultado_txt'     : 'sucesso - cep completo'
}
*/


var express     = require('express'),
    request     = require('request'),
    cheerio     = require('cheerio'),
    router      = express.Router(),
    rtg         = require("url").parse(process.env.REDISTOGO_URL),
    redisClient = require("redis").createClient(rtg.port, rtg.hostname);

redisClient.auth(rtg.auth.split(":")[1]);

function getAddress(answers) {
    return {
        logradouro: (answers.eq(0).toString() !== '') ? answers.eq(0).text().trim() : '',
        bairro:     (answers.eq(1).toString() !== '') ? answers.eq(1).text().trim() : '',
        localidade: (answers.eq(2).toString() !== '') ? answers.eq(2).text().trim().split('/')[0].trim() : '',
        uf:         (answers.eq(2).toString() !== '') ? answers.eq(2).text().trim().split('/')[1].trim() : ''
    };
}

function parseResponse(data) {
    return "var WS_CEP_RESULT = " + data + ";";
}

function requestCep (req, res, cb) {
    var cep  = req.params.cep;
    var data = 'cepEntrada=' + cep + '&metodo=buscarCep';

    request({
        'url': 'http://m.correios.com.br/movel/buscaCepConfirma.do',
        'method': 'POST',
        'encoding': 'binary',
        'headers': {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Host': 'm.correios.com.br',
            'Origin': 'http://m.correios.com.br/movel/buscaCepConfirma.do',
            'Referer': 'http://m.correios.com.br/movel/buscaCepConfirma.do',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.10; rv:35.0) Gecko/20100101 Firefox/35.0',
            "accept-charset": "ISO-8859-1,utf-8;q=0.7,*;q=0.3"
        },
        'jar': true,
        'form': data
    }, function (err, resp, body) {
        if (!err && res.statusCode === 200) {
            var $     = cheerio.load(body),
                error = $('.erro'),
                cepError, answers, address;

            res.setHeader('Content-Type', 'application/json');

            if (error.length) {
                cepError = {
                    status: 'error',
                    message: error.text().trim()
                };

                cb('{"error": true}');
            } else {
                answers = $('.respostadestaque');
                address = JSON.stringify(getAddress(answers));

                redisClient.set(cep, address);
                cb(address);
            }
        }
    });
}

router.get('/:cep', function (req, res) {
    redisClient.get(req.params.cep, function (err, cep) {
        var data = JSON.parse(cep);

        if (data && err === null && data.hasOwnProperty('logradouro')) {
            res.send(parseResponse(cep))
        } else {
            requestCep(req, res, function (response) {
                res.send(parseResponse(response));
            });
        }
    });
});

module.exports = router;
