<?php
	function create_html_doc() {
		$doc = new DOMDocument();
		$root = $doc->createElement("html");
		$doc->appendChild($root);
		$res = [
			"doc" => $doc,
			"root" => $root
		];
		$head = $doc->createElement("head");
			$res["head"] = $head;
			$charset = $doc->createElement("meta");
				$charset->setAttribute("charset","utf-8");
			$head->appendChild($charset);
			$title = $doc->createElement("title");
				$res["title"] = $title;
			$head->appendChild($title);
			$style = $doc->createElement("style");
				$res["style"] = $style;
			$head->appendChild($style);
		$root->appendChild($head);
		$body = $doc->createElement("body");
			$res["body"] = $body;
		$root->appendChild($body);
		return $res;
	}

	function push_css(&$doc,&$style,$ident,$rules) {
		$css = $ident."{";
		foreach ($rules as $key => &$rule) {
			$css .= $key.":".$rule.";";
			if ($key === "color") {
				$style->appendChild($doc->createTextNode($ident." hr{background-color:".$rule.";}"));
			}
		}
		$css .= "}";
		$style->appendChild($doc->createTextNode($css));
	}
	function get_css_rule(&$node,&$rules,$attrName,$cssName = null,$parseValue = null) {
		$value = $node->getAttribute($attrName);
		if ($value !== "") {
			$cssName = $cssName !== null ? $cssName : $attrName;
			if ($parseValue !== null) {
				$rules[$cssName] = call_user_func($parseValue,$value);
			} else {
				$rules[$cssName] = $value;
			}
		}
	}
	function create_xml_boolean_mapper($trueValue,$falseValue) {
		return function($value) use (&$trueValue,&$falseValue) {
			return $value === "1" ? $trueValue : $falseValue;
		};
	}
	function parse_css(&$node,$isDefault = false,$envCanvas = null) {
		$ident = $isDefault ? "body" : ".".$node->getAttribute("id");
		$rules = [];
		get_css_rule($node,$rules,"color");
		get_css_rule($node,$rules,"bgColor","background-color");
		get_css_rule($node,$rules,"bold","font-weight",create_xml_boolean_mapper("bold","normal"));
		get_css_rule($node,$rules,"italics","font-style",create_xml_boolean_mapper("italic","normal"));
		if ($isDefault) {
			$rules["font-size"] = $envCanvas->getAttribute("fontSize")."em";
			$rules["font-family"] = "'Courier New',monospace";
		}
		$res = [
			[
				"ident" => $ident,
				"rules" => $rules
			]
		];
		$linkColor = $node->getAttribute("linkColor");
		if ($linkColor !== "") {
			$res[] = [
				"ident" => $ident." a",
				"rules" => [
					"color" => $linkColor
				]
			];
		}
		return $res;
	}
	function push_parsed_css(&$doc,&$style,$parsed) {
		foreach ($parsed as $obj) {
			push_css($doc,$style,$obj["ident"],$obj["rules"]);
		}
	}

	function first_ele(&$node,$tagName) {
		return $node->getElementsByTagName($tagName)->item(0);
	}

	function transcribe_class(&$docNode,$class) {
		if ($class !== "") {
			$docNode->setAttribute("class",$class);
		}
	}
	function transcribe_block(&$flowNode,&$docNode,&$flowStack,$class,$oneLine) {
		$div = $docNode->ownerDocument->createElement("div");
			transcribe_class($div,$class);
			transcribe_child_flow($flowNode,$div,$flowStack,$oneLine);
		$docNode->appendChild($div);
	}
	function transcribe_line_break(&$docNode,$oneLine,$double) {
		if ($oneLine) {
			$docNode->appendChild($docNode->ownerDocument->createTextNode(" "));
		} else {
			$docNode->appendChild($docNode->ownerDocument->createElement("br"));
			if ($double) {
				$docNode->appendChild($docNode->ownerDocument->createElement("br"));
			}
		}
	}
	function transcribe_flow(&$flowNode,&$docNode,&$flowStack,$oneLine) {
		if ($flowNode->getAttribute("ts-ignore") !== "1") {
			$class = $flowNode->getAttribute("class");
			$tsMode = $flowNode->getAttribute("ts-mode");
			$oldOneLine = $oneLine;
			if ($tsMode !== "") {
				switch ($tsMode) {
					case "one-line":
						$oneLine = true;
						break;
					case "all-lines":
						$oneLine = false;
						break;
					default:
						throw new Exception("Undefined ts-mode \"".$tsMode."\".");
				}
			}

			switch ($flowNode->tagName) {
				case "block":
					transcribe_block($flowNode,$docNode,$flowStack,$class,$oneLine);
					break;
				case "text":
					transcribe_block($flowNode,$docNode,$flowStack,$class,$oneLine);
					transcribe_line_break($docNode,false,true);
					$oneLine = false;
					break;
				case "line":
					if (strlen($flowNode->textContent) > 0) {
						$span = $docNode->ownerDocument->createElement("span");
							transcribe_class($span,$class);
							transcribe_child_flow($flowNode,$span,$flowStack,$oneLine,true);
						$docNode->appendChild($span);
					}
					transcribe_line_break($docNode,$oneLine,false);
					break;
				case "span":
					if (strlen($flowNode->textContent) > 0) {
						$span = $docNode->ownerDocument->createElement("span");
							transcribe_class($span,$class);
							$span->appendChild($span->ownerDocument->createTextNode($flowNode->textContent));
						$docNode->appendChild($span);
					}
					break;
				case "hr":
					$hr = $docNode->ownerDocument->createElement("hr");
						transcribe_class($hr,$class);
						$width = $flowNode->getAttribute("width");
						if ($width !== "") {
							$width = intval($width);
							if ($width > 2) {
								$hr->setAttribute("style","height:".$width."px;");
							}
						}
						//$docNode->setAttribute("style","width:100%;");
					$docNode->appendChild($hr);
					break;
				case "user":
				case "wait":
					// Skip
					break;
				default:
					throw new Exception("Undefined node type \"".$flowNode->tagName."\".");
			}
			if ($oneLine && !$oldOneLine) {
				$docNode->appendChild($docNode->ownerDocument->createElement("br"));
			}
		}
	}
	function transcribe_child_flow(&$flowNode,&$docNode,&$flowStack,$oneLine,$pushText = false) {
		$flowStack[] = $flowNode->tagName;
		foreach ($flowNode->childNodes as $child) {
			if ($child->nodeType === XML_ELEMENT_NODE) {
				transcribe_flow($child,$docNode,$flowStack,$oneLine);
			} else if ($pushText && $child->nodeType === XML_TEXT_NODE && strlen($child->textContent) > 0) {
				$docNode->appendChild($docNode->ownerDocument->createTextNode($child->textContent));
			}
		}
		array_pop($flowStack);
	}		

	$doc = new DOMDocument();
	$doc->load("../user/novel.xml");
	$root = $doc->documentElement;
	$html = create_html_doc();
	$out = $html["doc"];
	$style = $html["style"];
	$body = $html["body"];
	$env = first_ele($root,"env");

	$html["title"]->nodeValue = first_ele($env,"title")->nodeValue;

	$envStyling = first_ele($env,"styling");
	$envStylingDefault = first_ele($envStyling,"default");
	push_css($out,$style,"div",[
		"display" => "inline-block",
		"width" => "100%"
	]);
	push_css($out,$style,"hr",[
		"width" => "100%",
		"height" => "2px",
		"border" => "0 none"
	]);
	push_parsed_css($out,$style,parse_css($envStylingDefault,true,first_ele($env,"canvas")));
	$classes = $envStyling->getElementsByTagName("class");
	foreach ($classes as $class) {
		push_parsed_css($out,$style,parse_css($class));
	}

	$flow = first_ele($root,"flow");
	$flowStack = [];
	transcribe_child_flow($flow,$body,$flowStack,false);
	echo $out->saveHTML();
?>