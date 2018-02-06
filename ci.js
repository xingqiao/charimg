/*! ci v1.2 | 字符画生成 | ctchen */
; (function (window, document) {
	var CI = (function () {
		var setting = {
			async: false,	// 异步模式
			workerJs: null,	// worker线程js
			random: false,	// 随机展现列表中的词语，为true时越靠前的词语优先级越高
			orientation: false,	// 根据meta信息调整图片方向
			minWidth: 150,
			minHeight: 150,
			fontFamily: ["黑体"],	// 字体
			minFontSize: 12,	// 基本填充大小
			fontZoom: 10,	// 最大填充倍数
			fontColor: "#000000",	// 文字颜色
			square: false,	// 拉伸填充图案
			useOnes: false,	// 填充元素只使用一次
			backgroundColor: "#ffffff",	// 背景色
			shadowColor: "#000000",	// 原图阴影颜色
			onerror: null
		};
		var worker;

		// 初始化worker
		function initWorker() {
			if (worker && worker.url != setting.workerJs) {
				worker = null;
			}
			if (!worker && setting.workerJs && typeof Worker != "undefined") {
				try {
					worker = new Worker(setting.workerJs);
					worker.addEventListener("message", function (e) {
						worker.handle && worker.handle(null, e.data);
					}, false);
					worker.addEventListener("error", function (e) {
						worker.handle && worker.handle(e);
						setting.onerror && setting.onerror(e);
						worker = setting.workerJs = null;
					}, false);
					worker.on = function (handle) {
						worker.handle = handle;
					};
					worker.url = setting.workerJs;
				} catch (ex) {
					setting.onerror && setting.onerror(ex);
					worker = setting.workerJs = null;
				}
			}
			return worker;
		};

		// 支持Worker的计算
		var alg = {
			// 马赛克
			mosaic: function (opts, callback) {
				var imageData = opts.imageData,
					pixes = imageData.data,
					indexTable = opts.indexTable,
					width = opts.width,
					ww = width * 4,
					height = opts.height || parseInt(pixes.length / ww),
					size = parseInt(opts.size) || 7,
					size_pow_2 = size * size,
					s1 = size * ww,
					s2 = size * 4,
					isWoodcut = "threshold" in opts,
					thresholdValue = opts.threshold > 0 ? opts.threshold * 255 : 127.5;
				for (var x = 0, p1 = 0, ix = 0; x < height; x += size, p1 += s1, ix++) {
					for (var y = 0, p2 = p1, iy = 0; y < width; y += size, p2 += s2, iy++) {
						var temp = [0, 0, 0],
							size_w = width - y,
							size_h = height - x,
							pixelNum;

						// 判断当前是否能够放下的方格大小
						if ((size_w < size) || (size_h < size)) {
							size_w < size || (size_w = size);
							size_h < size || (size_h = size);
							pixelNum = size_w * size_h;
						} else {
							size_w = size;
							size_h = size;
							pixelNum = size_pow_2;
						}

						// 统计方格内颜色值的和
						for (var i = 0, p3 = p2; i < size_h; i++ , p3 += ww) {
							for (var j = 0, p4 = p3; j < size_w; j++ , p4 += 4) {
								if (pixes[p4 + 3] == 0) {
									temp[0] += 255;
									temp[1] += 255;
									temp[2] += 255;
								} else {
									temp[0] += pixes[p4];
									temp[1] += pixes[p4 + 1];
									temp[2] += pixes[p4 + 2];
								}
							}
						}

						// 计算马赛克化后的颜色值
						if (isWoodcut) {
							// 去色
							temp[0] = (temp[0] * 0.299 + temp[1] * 0.587 + temp[2] * 0.114) / pixelNum;	// js大数乘法性能弱于除法
							if (temp[0] > thresholdValue) {
								temp[0] = temp[1] = temp[2] = 255;
							} else {
								temp[0] = temp[1] = temp[2] = 0;
							}
						} else {
							// 保留颜色值
							temp[0] = parseInt(temp[0] / pixelNum);
							temp[1] = parseInt(temp[1] / pixelNum);
							temp[2] = parseInt(temp[2] / pixelNum);
						}

						// 生成索引表
						if (indexTable) {
							if (!indexTable[ix]) {
								indexTable[ix] = [];
							}
							indexTable[ix][iy] = temp;
						}

						// 将颜色值设置回ImageData
						if (!opts.notWrite) {
							for (var i = 0, p3 = p2; i < size_h; i++ , p3 += ww) {
								for (var j = 0, p4 = p3; j < size_w; j++ , p4 += 4) {
									pixes[p4] = temp[0];
									pixes[p4 + 1] = temp[1];
									pixes[p4 + 2] = temp[2];
								}
							}
						}
					}
				}
				var data = {
					imageData: imageData,
					indexTable: indexTable
				};
				callback && callback(data);
				return data;
			},

			// 布局
			layout: function (opts, callback) {
				var renderTable = opts.renderTable,
					indexTable = opts.indexTable,
					wordList = opts.wordList,
					maxWidth = opts.maxWidth,
					maxHeight = opts.maxHeight,
					fontSize = opts.fontSize,
					vertical = opts.vertical,
					useOnes = opts.useOnes;

				function filterWord(wordList, size, isHor) {
					var word = [],
						widthIndex = isHor ? 2 : 4,
						heightIndex = isHor ? 3 : 5;
					for (var i = 0; i < wordList.length; i++) {
						var wl = wordList[i];
						wl.forEach(function (item) {
							if (size[Math.ceil(item[heightIndex])] >= item[widthIndex]) {
								item[8] = i;	// 标记自己所属的组
								word.push(item);
							}
						});
					}
					return word;
				};
				for (var y = 0; (y < indexTable.length) && wordList.length; y++) {
					for (var x = 0; (x < indexTable[y].length) && wordList.length; x++) {
						if (indexTable[y][x] && indexTable[y][x][0] == 0) {
							var size = {};

							// 遍历widthIndex*heightIndex范围内的有效点，确认每种情况下能够放入的最大文字长度
							for (var i = 0, len_i = Math.min(indexTable.length - y, maxHeight); i < len_i; i++) {
								for (var j = 0, len_j = Math.min(maxWidth, indexTable[i].length - x, size[i] ? size[i] : indexTable[i].length); j < len_j; j++) {
									if (indexTable[y + i][x + j] && indexTable[y + i][x + j][0] == 0) {
										size[i + 1] = j + 1;
									} else {
										break;
									}
								}
								if (!size[i + 1]) {
									break;
								}
							}

							// 寻找能够容纳下的文本
							var isHor = (vertical == 0) || (Math.random() >= vertical),	// 是否按水平方式绘制
								word = filterWord(wordList, size, isHor), no;
							if (!isHor && (!word || !word.length)) {
								// 如果按当前绘制方式未匹配到，则更改绘制方式再匹配一次
								isHor = !isHor;
								word = filterWord(wordList, size, isHor);
							}
							if (word.length) {
								// 随机选择一个文本，如果用算法控制，优先选择序号小的文本，则文本列表中靠前的词语会优先出现
								var no = word.length * Math.random();
								if (!setting.random) {
									no *= Math.random();
								}
								word = word[parseInt(no)];
								if (word) {
									var xPos = x * fontSize,
										yPos = y * fontSize;
									// 生成待渲染列表
									if (word[7] != null) {
										// 图片
										renderTable.push([null, xPos, yPos, word[2], word[3], word[7]]);	// 图片 x坐标 y坐标 宽度单位 高度单位 图片序号
									} else {
										// 文本
										if (word[6] > 0 || word[6] < 0) {
											yPos -= word[6];	// 字体渲染偏移
										}
										renderTable.push([word[0], xPos, yPos, word[1], isHor ? 0 : word[3] * fontSize]);	// 文本 x坐标 y坐标 字体样式 （垂直时返回）字体大小
									}

									// 去掉同组的其他元素
									if (useOnes) {
										wordList.splice(word[8], 1);

										// 没有待填充元素时直接返回
										if (!wordList.length) {
											break;
										}
									}

									// 清空已被占用的点
									var len_i = isHor ? word[3] : word[5],
										len_j = isHor ? word[2] : word[4];
									for (var i = 0; i < len_i; i++) {
										for (var j = 0; j < len_j; j++) {
											indexTable[y + i] && (indexTable[y + i][x + j] = null);
										}
									}

									// 跳过已清空的点
									x += parseInt(len_j - 1);
								}
							} else {
								// 未找到合适填充的文本
							}
						} else {
							indexTable[y][x] = null;
						}
					}
				}

				var data = { renderTable: renderTable };
				callback && callback(data);
				return data;
			}
		};
		function doAlg(algName, opts, callback) {
			// 先尝试用Worker执行，不支持或出错的话在同步执行
			initWorker();
			if (setting.workerJs && worker) {
				try {
					worker.on(function (err, data) {
						if (err) {
							setting.onerror && setting.onerror(err);
							alg[algName].call(null, opts, callback);
						} else {
							// 复制数组类型参数
							if (data) {
								for (var p in data) {
									if (data[p] && opts[p] && data[p] instanceof Array) {
										opts[p].length = 0;
										data[p] = $.extend(opts[p], data[p]);
									}
								}
							}
							callback(data);
						}
					});
					worker.postMessage({ algName: algName, opts: opts });
				} catch (ex) {
					setting.onerror && setting.onerror(ex);
				}
			} else {
				alg[algName].call(null, opts, callback);
			}
		};

		// 异步串行控制流
		function series(async, tasks, callback) {
			if (typeof async == "function" || async instanceof Array) {
				callback = tasks;
				tasks = async;
				async = false;
			}
			if (typeof tasks == "function") {
				tasks = [tasks];
			} else if (!tasks) {
				tasks = [];
			}
			if (typeof callback != "function") {
				callback = null;
			}
			var pos = -1, data;
			function iterator() {
				pos++;
				if (pos < tasks.length) {
					var task = tasks[pos];
					if (typeof task == "function") {
						task.call({ index: pos + 1, count: tasks.length }, data, function (err, lastdata) {
							if (err) {
								callback && callback(err, data);
							} else {
								data = lastdata;
								if (async) {
									setTimeout(iterator, 0);
								} else {
									iterator();
								}
							}
						});
					} else {
						iterator();
					}
				} else {
					callback && callback(null, data);
				}
			};
			iterator();
		};

		function isImg(img) {
			return img && (/^img|canvas$/i.test(img.tagName));
		};

		// Worker环境处理
		if (typeof window == "undefined") {
			this.window = this.document = {};
			this.onmessage = function (e) {
				if (e.data.algName && alg[e.data.algName]) {
					alg[e.data.algName].call(null, e.data.opts, function (data) {
						postMessage(data);
					});
				} else {
					postMessage(e.data.opts);
				}
			};
		}
		window.URL || (window.URL = window.webkitURL);

		return {
			setting: setting,

			covenToArray: function (o) {
				return o instanceof Array ? o : [o];
			},

			// 获取文件的 ObjectURL
			getFileUrl: function (file, type, callback) {
				if (typeof type == "function") {
					callback = type;
					type = null;
				}
				// 默认采用 URL 的方式读取，不支持 URL 时采用 FileReader
				try {
					if (!/FileReader/.test(type) && window.URL) {
						var url = window.URL.createObjectURL(file);
						callback && callback(null, url);
					} else {
						var reader = new FileReader();
						reader.onload = function (e) {
							callback && callback(null, this.result);
						};
						reader.onerror = function (e) {
							callback && callback("FileReader解析失败");
						};
						reader.readAsDataURL(file);
					}
				} catch (ex) {
					callback && callback(ex);
				}
			},

			// 解析图片地址
			openImgUrl: function (imgurl, callback) {
				// 解析图片方向时必须使用Filereader的方式解析
				if (imgurl) {
					var img = new Image();
					img.onload = function () {
						callback && callback(null, img);
					};
					img.onerror = function () {
						callback && callback("error");
					};
					img.src = imgurl;
				}
			},

			// 解析图片方向
			parseImgOrientation: function (file, callback) {
				// JPEG格式介绍 http://www.cppblog.com/lymons/archive/2010/02/23/108266.aspx
				var reader = new FileReader();
				function _readFile(pos, size, callback) {
					reader.onload = function (e) {
						var err, data;
						if (this.result && this.result.byteLength > 0) {
							try {
								data = new Uint8Array(this.result, pos, this.result.byteLength);
							} catch (ex) {
								err = ex;
							}
						} else {
							err = "File End";
						}
						callback && callback(err, pos, data);
					};
					try {
						var _file = file;
						if (file.slice) {
							_file = file.slice(pos, size);
							pos = 0;
						}
						reader.readAsArrayBuffer(_file);
					} catch (ex) {
						callback && callback(ex);
					}
				};

				function _parseNum(big_endian, data, offset, size) {
					var num = 0;
					offset = offset > 0 ? offset : 0;
					size = size > 0 ? size : data.length - offset;
					for (var i = 0; i < size; i++) {
						num <<= 8;
						num += data[big_endian ? offset + i : offset + size - i - 1];
					}
					return num;
				};

				// 获取 Exif 内容
				function _getExif(pos, data, callback) {
					// 定位到 APP1
					if (data[0] == 0xFF && data[1] == 0xE1) {
						// 判断是否是 Exif
						if (data[4] == 0x45 && data[5] == 0x78 && data[6] == 0x69 && data[7] == 0x66) {	// Exif
							callback && callback(null, pos + 10, Array.prototype.slice.call(data, 10));
						} else {
							callback && callback("Not Exif");
						}
					} else {
						pos += _parseNum(true, data, 2, 2) + 2;
						_readFile(pos, 8000, function (err, pos, data) {
							if (err) {
								callback && callback(err);
							} else {
								_getExif(pos, data, callback);
							}
						});
					}
				};

				// 读取文件比较耗费时间，所以一次性预读取1K数据
				_readFile(0, 8000, function (err, pos, data) {
					// 判断是否是jpeg格式
					if (data && data[0] == 0xFF && data[1] == 0xD8) {
						pos += 2;

						// 获取 Exif 内容
						_getExif(pos, Array.prototype.slice.call(data, 2), function (err, pos, data) {
							if (err) {
								return callback && callback("No Exif");
							}

							// 字节序
							var endian;
							if (data[0] == 0x49 && data[1] == 0x49) {	// II Intel 小端模式
								endian = 0;
							} else if (data[0] == 0x4D && data[1] == 0x4D) {	// MM Motorola 大端模式
								endian = 1;
							} else {
								return callback && callback("Unknown Endian");
							}

							// 定位到 TIFF 标签
							var offset = _parseNum(endian, data, 4, 4);

							// 标签数
							var tagNum = _parseNum(endian, data, offset, 2);
							offset += 2;

							// 解析 TIFF 标签
							for (var i = 0; i < tagNum; i++) {
								var tag = _parseNum(endian, data, offset, 2);

								// Orientation 标签
								if (tag == 0x0112) {	// 0x0112 Orientation
									var orientation = _parseNum(endian, data, offset + 8, 2);
									return callback && callback(null, orientation);
								}

								offset += 12;	// 每个标签大小是12字节
							}

							callback && callback(null, 0);
						});
					} else {
						callback && callback("Not jpeg");
					}
				});
			},

			// 解析图片文件
			openImgFile: function (file, opts, callback) {
				if (typeof opts == "function") {
					callback = opts;
					opts = null;
				}
				opts || (opts = {});
				var ci = this, type, orientation = opts.orientation == null ? setting.orientation : opts.orientation;
				if (file && (/image/.test(file.type) || !file.type)) {
					this.getFileUrl(file, type, function (err, url) {
						if (err) {
							callback && callback(err);
						} else {
							ci.openImgUrl(url, function (err, img) {
								if (!err) {
									if (orientation) {
										ci.parseImgOrientation(file, function (err, orien) {
											var canvas;
											if (!err) {
												var width = img.width, height = img.height;
												if (orien >= 5 && orien <= 8) {
													width = img.height;
													height = img.width;
												}
												canvas = ci.createCanvas(width, height);
												var ctx = canvas.getContext('2d');
												switch (orien) {
													case 2:
														// horizontal flip
														ctx.translate(width, 0);
														ctx.scale(-1, 1);
														break;
													case 3:
														// 180 rotate left
														ctx.translate(width, height);
														ctx.rotate(Math.PI);
														break;
													case 4:
														// vertical flip
														ctx.translate(0, height);
														ctx.scale(1, -1);
														break;
													case 5:
														// vertical flip + 90 rotate right
														ctx.rotate(0.5 * Math.PI);
														ctx.scale(1, -1);
														break;
													case 6:
														// 90 rotate right
														ctx.rotate(0.5 * Math.PI);
														ctx.translate(0, -img.height);
														break;
													case 7:
														// horizontal flip + 90 rotate right
														ctx.rotate(0.5 * Math.PI);
														ctx.translate(width, -img.height);
														ctx.scale(-1, 1);
														break;
													case 8:
														// 90 rotate left
														ctx.rotate(-0.5 * Math.PI);
														ctx.translate(-img.width, 0);
														break;
													default:
														break;
												}
												ctx.drawImage(img, 0, 0, img.width, img.height);
											} else {
												setting.onerror && setting.onerror(err);
												canvas = ci.loadImgToCanvas(img).canvas;
											}
											callback && callback(null, canvas);
										});
									} else {
										callback && callback(null, opts.type == "canvas" ? ci.loadImgToCanvas(img).canvas : img);
									}
								} else {
									callback && callback(err);
								}
							});
						}
					});
				} else if (file) {
					callback && callback("请选择图片文件");
				}
			},

			// 加载图片到canvas
			loadImgToCanvas: function (img, opts) {
				if (!opts) {
					opts = {};
				}
				var width = opts.width || img.width,
					height = opts.height || img.height;

				if (width < setting.minWidth) {
					height = parseInt(setting.minWidth * height / width);
					width = setting.minWidth;
				}
				if (height < setting.minHeight) {
					width = parseInt(setting.minHeight * width / height);
					height = setting.minHeight;
				}

				var canvas;
				if (opts.canvas) {
					canvas = opts.canvas;
				} else {
					canvas = this.createCanvas(width, height, opts.viewWidth, opts.viewHeight);
				}

				var ctx = canvas.getContext("2d"),
					x = 0, y = 0,
					sw = width,
					sh = height;
				if (sw != img.width || sh != img.height) {
					sw = width / img.width,
						sh = height / img.height;
					if (sw > sh) {
						sw = sh * img.width;
						sh = height;
						x = (width - sw) / 2;
					} else {
						sh = sw * img.height;
						sw = width;
						y = (height - sh) / 2;
					}
				}
				if (opts.backgroundColor) {
					ctx.fillStyle = opts.backgroundColor;	// 背景色
					ctx.fillRect(0, 0, width, height);
				}
				ctx.drawImage(img, x, y, sw, sh);

				return {
					canvas: canvas,
					width: width,
					height: height,
					originalWidth: img.width,
					originalHeight: img.height
				};
			},

			// 创建画布
			createCanvas: function (width, height, viewWidth, viewHeight, name) {
				var backgroundColor;
				if (typeof width == "object" && width && width.width) {
					backgroundColor = width.backgroundColor;
					name = width.name;
					viewWidth = width.viewWidth;
					viewHeight = width.viewHeight;
					height = width.height;
					width = width.width;
				}
				var canvas = document.createElement("canvas");
				if (width > 0) {
					canvas.width = width;
					if (!(height > 0)) {
						height = width;
					}
				}
				if (height > 0) {
					canvas.height = height;
				}
				if (viewWidth) {
					canvas.style.width = viewWidth + (viewWidth > 0 ? "px" : "");
				}
				if (viewHeight) {
					canvas.style.height = viewHeight + (viewHeight > 0 ? "px" : "");
				}
				if (name) {
					canvas.setAttribute("data-name", name);
				}
				if (backgroundColor) {
					var ctx = canvas.getContext("2d");
					ctx.fillStyle = backgroundColor;
					ctx.fillRect(0, 0, canvas.width, canvas.height);
				}
				return canvas;
			},

			// 创建背景画布
			createBgCanvas: function (width, height, viewWidth, viewHeight) {
				if (typeof width == "object" && width && width.width) {
					viewWidth = width.viewWidth;
					viewHeight = width.viewHeight;
					height = width.height;
					width = width.width;
				}
				var canvas = this.createCanvas(width, height, viewWidth, viewHeight),
					bg = this.createCanvas(40, 40),
					ctx = bg.getContext("2d");
				ctx.fillStyle = "#fff";
				ctx.fillRect(0, 0, 40, 40);
				ctx.fillStyle = "rgba(220,220,220,.5)";
				ctx.fillRect(20, 0, 20, 20);
				ctx.fillRect(0, 20, 20, 20);
				ctx = canvas.getContext("2d");
				ctx.fillStyle = ctx.createPattern(bg, "repeat");
				ctx.fillRect(0, 0, width, height);
				return canvas;
			},

			// 版画渲染
			woodcut: function (canvas, opts) {
				opts = $.extend({}, opts);
				var ctx = canvas.getContext("2d");
				var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
				var pixes = imageData.data;
				var pR = opts.pR || 0;
				var pG = opts.pG || 0;
				var pB = opts.pB || 0;
				var pA = (opts.pA != null) ? opts.pA : 255;
				var bR = (opts.bR != null) ? opts.bR : 255;
				var bG = (opts.bG != null) ? opts.bG : 255;
				var bB = (opts.bB != null) ? opts.bB : 255;
				var bA = (opts.bA != null) ? opts.bA : 255;
				var thresholdValue = opts.threshold > 0 ? opts.threshold * 765 : 382.5;
				for (var i = 0, len = pixes.length; i < len; i += 4) {
					if (pixes[i + 3] == 0 || pixes[i] + pixes[i + 1] + pixes[i + 2] > thresholdValue) {
						pixes[i] = bR;
						pixes[i + 1] = bG;
						pixes[i + 2] = bB;
						pixes[i + 3] = bA;
					} else {
						pixes[i] = pR;
						pixes[i + 1] = pG;
						pixes[i + 2] = pB;
						pixes[i + 3] = pA;
					}
				}
				if (opts.target) {
					ctx = opts.target.getContext("2d");
				}
				ctx.putImageData(imageData, 0, 0);
			},

			// 马赛克渲染
			mosaic: function (canvas, opts, callback) {
				opts = $.extend({}, opts);
				var ctx = canvas.getContext("2d");
				doAlg("mosaic", {
					imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
					width: canvas.width,
					height: canvas.height,
					size: opts.size,
					threshold: opts.threshold,
					indexTable: opts.indexTable,
					notWrite: opts.notWrite
				}, function (data) {
					// 回写数据
					if (!opts.notWrite) {
						if (opts.target) {
							ctx = opts.target.getContext("2d");
						}
						ctx.putImageData(data.imageData, 0, 0);
					}
					callback && callback(data);
				});
			},

			// 计算绘制后的文本距离顶部的偏移
			getFontDeviation: function (fontFamily, textBaseline) {
				// 绘制一条横线，然后计算横线与中间线的偏移
				var canvas = CI.createCanvas(),
					ctx = canvas.getContext("2d"),
					fontSize = 12;
				canvas.width = fontSize;
				canvas.height = fontSize * 3;
				ctx.textBaseline = textBaseline || "top";
				ctx.font = fontSize + "px " + fontFamily;
				ctx.fillStyle = "#fff";
				ctx.fillText("─", 0, fontSize);
				var imageData = ctx.getImageData(parseInt(canvas.width / 2), 0, 1, canvas.height),
					pixes = imageData.data,
					pos = 0;
				for (var i = 0, len = pixes.length; i < len; i += 4) {
					pos++;
					if (pixes[i] > 128) {
						return (pos - fontSize * 1.5) / fontSize;
					}
				}
				return 0;
			},

			// 计算文本绘制后长度
			measureText: function (str, fontFamily, fontSize, fontZoom, imglist, square) {
				var ci = this;
				var result = [];
				str = [].concat(this.covenToArray(str));
				fontFamily = this.covenToArray(fontFamily);
				fontSize = fontSize > setting.minFontSize ? fontSize : setting.minFontSize;
				fontZoom = fontZoom >= 1 ? fontZoom : 1;
				imglist || (imglist = []);

				// 计算字体偏移
				var dev = {};
				fontFamily.forEach(function (f) {
					dev[f] = ci.getFontDeviation(f, "top");
				});

				// 计算文本大小
				var canvas = this.createCanvas(),
					ctx = canvas.getContext("2d");
				str.forEach(function (word) {
					var re = [];
					result.push(re);
					if (isImg(word)) {
						// 填充图
						var index = imglist.length;
						var height = 1;
						imglist.push(word);

						// 不拉伸时计算高度
						if (!square) {
							height = word.height / word.width;
						}

						// 计算出在不同字体倍数下文字绘制大小
						for (var i = fontZoom; i > 0; i--) {
							re.push([
								null,
								null,
								i,	// 宽度单位（水平）
								height * i,	// 倍数|高度单位（水平）
								i,	// 宽度单位（垂直）
								height * i,	// 高度单位（垂直）
								null,
								index	// 图片索引
							]);
						}
					} else if (word = ("" + word).trim()) {
						// 填充文字
						fontFamily.forEach(function (f) {
							var fontList = [];
							for (var i = 1; i <= fontZoom; i++) {
								fontList[i] = fontSize * i + "px / " + fontSize * i + "px " + f;
							}
							ctx.font = fontSize + "px / " + fontSize + "px " + f;
							var width = 0, singleWidth = 0, len = word.length;

							// 计算出每个字符的绘制宽度，最大的为垂直绘制时的宽度
							for (var i = 0; i < len; i++) {
								var w = ctx.measureText(word.charAt(i)).width;
								width += w;
								if (singleWidth < w) {
									singleWidth = w;
								}
							}
							width /= fontSize;
							singleWidth /= fontSize;

							// 计算出在不同字体倍数下文字绘制大小
							for (var i = fontZoom; i > 0; i--) {
								re.push([
									word,	// 文本
									fontList[i],	// 字体
									width * i,	// 宽度单位（水平）
									i,	// 倍数|高度单位（水平）
									singleWidth * i,	// 宽度单位（垂直）
									len * i,	// 高度单位（垂直）
									dev[f] ? parseInt(dev[f] * fontSize * i) : 0	// 字体渲染偏移
								]);
							}
						});
					}
				});

				return result;
			},

			// 生成字符画
			// 支持的参数
			// threshold: 0.5,	// 轮廓阈值
			// fontFamily: ["黑体"],	// 字体
			// fontSize: 12,	// 基本字体大小
			// fontZoom: 10,	// 最大字体大小倍数
			// vertical: 0,	// 竖排文字比例
			// fontColor: "#000000",	// 文字颜色
			// backgroundColor: "#ffffff",	// 背景色
			// shadowColor: "#000000",	// 原图阴影颜色
			// shadowOpacity: 0.2,	// 原图阴影透明度
			// backgroundImg: null,	// 背景图
			// backgroundImgOpacity: 1,	// 背景图透明度
			// watermarkImg: null,	// 水印图
			// watermarkImgOpacity: 0.9	// 水印图透明度
			// square: false	// 拉伸填充图
			// useOnes: false	// 填充元素只是用一次
			createCharImg: function (canvas, opts, callback) {
				var ci = this;

				// 处理参数
				// 有renderTable时直接渲染，有indexTable不需要重新计算索引
				opts = $.extend({}, opts);
				var onprogress = typeof opts.onprogress == "function" ? opts.onprogress : null;
				onended = typeof opts.onended == "function" ? opts.onended : null;
				wordList = opts.wordList,
					indexTable = opts.indexTable && opts.indexTable instanceof Array ? opts.indexTable : [],
					renderTable = opts.renderTable && opts.renderTable instanceof Array ? opts.renderTable : [],
					fontFamily = opts.fontFamily || setting.fontFamily,
					fontSize = opts.fontSize > setting.minFontSize ? opts.fontSize : setting.minFontSize,
					fontZoom = opts.fontZoom >= 1 ? opts.fontZoom : setting.fontZoom,
					fontColor = opts.fontColor || setting.fontColor,
					backgroundColor = opts.backgroundColor || setting.backgroundColor,
					shadowColor = opts.shadowColor || setting.shadowColor,
					square = opts.square != null ? opts.square : setting.square,
					useOnes = opts.useOnes != null ? opts.useOnes : setting.useOnes,
					vertical = opts.vertical > 0 ? Math.min(1, opts.vertical) : 0,
					threshold = opts.threshold >= 0 ? opts.threshold : 0.5;
				var ctx = canvas.getContext("2d");

				series(setting.async, [
					// 加载图片到canvas
					function (data, next) {
						var img = opts.img;
						if (img && img.tagName == "IMG") {
							var c = this.loadImgToCanvas(img, { width: img.width, height: img.height });
							opts.img = c.canvas;
						}
						next();
					},

					// 生成索引
					function (data, next) {
						var _series = this;
						if (renderTable.length == 0 && indexTable.length == 0) {
							ci.mosaic(opts.img, { threshold: threshold, size: fontSize, indexTable: indexTable, notWrite: 1 }, function (data) {
								onprogress && onprogress.call(_series);
								next();
							});
						} else {
							next();
						}
					},

					// 计算填充元素列表
					function (data, next) {
						var _series = this;
						if (renderTable.length == 0) {
							data = { maxWidth: 0, maxHeight: 0, imglist: [] };
							wordList = ci.measureText(wordList, fontFamily, fontSize, fontZoom, data.imglist, square);
							for (var i = 0; i < wordList.length; i++) {
								var wl = wordList[i];
								wl.forEach(function (item) {
									item[2] > data.maxWidth && (data.maxWidth = item[2]);	// 水平绘制时宽度
									item[5] > data.maxHeight && (data.maxHeight = item[5]);	// 垂直绘制时高度
								});
							}

							onprogress && onprogress.call(_series);
							next(null, data);
						} else {
							next();
						}
					},

					// 计算文字渲染列表
					function (data, next) {
						var _series = this;
						if (renderTable.length == 0) {
							var index = this.index, imglist = data.imglist;
							doAlg("layout", {
								indexTable: $.extend(true, [], indexTable),
								renderTable: renderTable,
								wordList: wordList,
								maxWidth: data.maxWidth,
								maxHeight: data.maxHeight,
								fontSize: fontSize,
								vertical: vertical,
								useOnes: useOnes
							}, function (data) {
								// 处理图片
								renderTable.forEach(function (r) {
									if (r[5] != null) {
										r[0] = imglist[r[5]];
										r[3] = Math.round(r[3] * fontSize);
										r[4] = Math.round(r[4] * fontSize);
									}
								});

								onprogress && onprogress.call(_series);
								next();
							});
						} else {
							next();
						}
					},

					// 绘制背景
					function (data, next) {
						var _series = this;
						ctx.fillStyle = backgroundColor;	// 背景色
						ctx.fillRect(0, 0, canvas.width, canvas.height);
						if (opts.backgroundImg && /^(img|canvas)$/i.test(opts.backgroundImg.tagName)) {
							ctx.globalAlpha = opts.backgroundImgOpacity >= 0 ? opts.backgroundImgOpacity : 1;
							ctx.drawImage(opts.backgroundImg, 0, 0, canvas.width, canvas.height);	// 背景图
							ctx.globalAlpha = 1;
						}
						onprogress && onprogress.call(_series);
						next();
					},

					// 原图阴影
					function (data, next) {
						var _series = this;
						if (opts.shadowOpacity > 0) {
							var bgCanvas = ci.createCanvas(canvas.width, canvas.height),
								color, pR = 0, pG = 0, pB = 0;
							if (color = ("" + shadowColor).match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)) {
								pR = parseInt(color[1], 16);
								pG = parseInt(color[2], 16);
								pB = parseInt(color[3], 16);
							}
							ci.woodcut(opts.img, {
								target: bgCanvas,
								pR: pR,
								pG: pG,
								pB: pB,
								pA: opts.shadowOpacity * 255 | 0,
								bA: 0
							});
							ctx.globalAlpha = opts.shadowOpacity;
							ctx.drawImage(bgCanvas, 0, 0, canvas.width, canvas.height);
							ctx.globalAlpha = 1;
							onprogress && onprogress.call(_series);
						}
						next();
					},

					// 填充渲染
					function (data, next) {
						var _series = this;
						ctx.fillStyle = fontColor;
						ctx.textBaseline = "top";
						renderTable.forEach(function (r) {
							if (r[5] != null) {
								// 图片
								if (r[0]) {
									ctx.drawImage(r[0], 0, 0, r[0].width, r[0].height, r[1], r[2], r[3], r[4]);
								}
							} else {
								// 文本
								ctx.font = r[3];
								if (r[4] > 0) {
									// 垂直
									var top = r[2];
									for (var j = 0, len_j = r[0].length; j < len_j; j++) {
										ctx.fillText(r[0].charAt(j), r[1], top);
										top += r[4]
									}
								} else {
									// 水平
									ctx.fillText(r[0], r[1], r[2]);
								}
							}
						});
						onprogress && onprogress.call(_series);
						next();
					},

					// 水印
					function (data, next) {
						var _series = this;
						if (opts.watermarkImg && /^(img|canvas)$/i.test(opts.watermarkImg.tagName)) {
							ctx.globalAlpha = opts.watermarkImgOpacity >= 0 ? opts.watermarkImgOpacity : 1;
							ctx.drawImage(opts.watermarkImg, 0, 0, canvas.width, canvas.height);
							ctx.globalAlpha = 1;
						}
						onprogress && onprogress.call(_series);
						next();
					},
				], function (err) {
					onended && onended();
				}, true);

				return ci;
			}
		};
	})();
})(window, document);
