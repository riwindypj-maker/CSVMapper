// 変換グラフのドメインテスト。
// RELEVANT FILES: ../include/csvmapper/transformation_graph.h, ../src/transformation_graph.cpp

#include "csvmapper/transformation_graph.h"
#include "test_utils.h"

#include <algorithm>
#include <cassert>
#include <string>
#include <system_error>
#include <variant>
#include <vector>

namespace csvmapper {

void TestInputToOutput() {
  TransformationGraph graph;
  assert(!graph.AddInputNode("in1", u"name"));
  assert(!graph.AddOutputNode("out1", u"output"));
  assert(!graph.AddEdge("e1", "in1", "out1"));
  auto values = graph.Evaluate({{"in1", u"Alice"}});
  assert(std::get<std::u16string>(values["out1"]) == u"Alice");
}

void TestInputBlockOutput() {
  TransformationGraph graph;
  assert(!graph.AddInputNode("in1", u"name"));
  assert(!graph.AddBlockNode("b1", u"upper", BlockInfo{BlockType::ToUpper, {}}));
  assert(!graph.AddOutputNode("out1", u"output"));
  assert(!graph.AddEdge("e1", "in1", "b1"));
  assert(!graph.AddEdge("e2", "b1", "out1"));
  auto values = graph.Evaluate({{"in1", u"Alice"}});
  assert(std::get<std::u16string>(values["out1"]) == u"ALICE");
}

void TestBranch() {
  TransformationGraph graph;
  assert(!graph.AddInputNode("in1", u"name"));
  assert(!graph.AddOutputNode("out1", u"o1"));
  assert(!graph.AddOutputNode("out2", u"o2"));
  assert(!graph.AddEdge("e1", "in1", "out1"));
  assert(!graph.AddEdge("e2", "in1", "out2"));
  auto values = graph.Evaluate({{"in1", u"X"}});
  assert(std::get<std::u16string>(values["out1"]) == u"X");
  assert(std::get<std::u16string>(values["out2"]) == u"X");
}

void TestCyclePrevention() {
  TransformationGraph graph;
  assert(!graph.AddInputNode("in1", u"name"));
  assert(!graph.AddBlockNode("b1", u"b1", BlockInfo{BlockType::ToUpper, {}}));
  assert(!graph.AddBlockNode("b2", u"b2", BlockInfo{BlockType::ToUpper, {}}));
  assert(!graph.AddEdge("e1", "in1", "b1"));
  assert(!graph.AddEdge("e2", "b1", "b2"));
  auto ec = graph.AddEdge("e3", "b2", "b1");
  assert(ec == GraphErrorCode::WouldCreateCycle);
}

void TestOutputAsSource() {
  TransformationGraph graph;
  assert(!graph.AddOutputNode("out1", u"o1"));
  assert(!graph.AddOutputNode("out2", u"o2"));
  auto ec = graph.AddEdge("e1", "out1", "out2");
  assert(ec == GraphErrorCode::OutputAsSource);
}

void TestMultipleInputsToSingleBlock() {
  TransformationGraph graph;
  assert(!graph.AddInputNode("in1", u"a"));
  assert(!graph.AddInputNode("in2", u"b"));
  assert(!graph.AddBlockNode("b1", u"upper", BlockInfo{BlockType::ToUpper, {}}));
  assert(!graph.AddEdge("e1", "in1", "b1"));
  auto ec = graph.AddEdge("e2", "in2", "b1");
  assert(ec == GraphErrorCode::TooManyInputs);
}

void TestJoinGraph() {
  TransformationGraph graph;
  assert(!graph.AddInputNode("in1", u"a"));
  assert(!graph.AddInputNode("in2", u"b"));
  assert(!graph.AddBlockNode("b1", u"join", BlockInfo{BlockType::Join, JoinConfig{u",", true}}));
  assert(!graph.AddOutputNode("out1", u"output"));
  assert(!graph.AddEdge("e1", "in1", "b1"));
  assert(!graph.AddEdge("e2", "in2", "b1"));
  assert(!graph.AddEdge("e3", "b1", "out1"));
  auto values = graph.Evaluate({{"in1", u"A"}, {"in2", u"B"}});
  assert(std::get<std::u16string>(values["out1"]) == u"A,B");
}

void TestJoinPropertyOrder() {
  TransformationGraph graph;
  assert(!graph.AddInputNode("in1", u"a"));
  assert(!graph.AddInputNode("in2", u"b"));
  assert(!graph.AddBlockNode("b1", u"join", BlockInfo{BlockType::Join, JoinConfig{u",", true}}));
  assert(!graph.AddOutputNode("out1", u"output"));
  // 接続は in1→in2 の順だが、プロパティ順を逆にする。
  assert(!graph.AddEdge("e1", "in1", "b1"));
  assert(!graph.AddEdge("e2", "in2", "b1"));
  assert(!graph.AddEdge("e3", "b1", "out1"));
  assert(!graph.SetJoinInputOrder("b1", {"e2", "e1"}));
  auto values = graph.Evaluate({{"in1", u"A"}, {"in2", u"B"}});
  assert(std::get<std::u16string>(values["out1"]) == u"B,A");
}

void TestValidateMissingOutputName() {
  TransformationGraph graph;
  assert(!graph.AddOutputNode("out1", u""));
  auto [errors, warnings] = graph.Validate();
  assert(std::find(errors.begin(), errors.end(), GraphErrorCode::NoOutputName) != errors.end());
}

void TestRemoveNodeRemovesEdges() {
  TransformationGraph graph;
  assert(!graph.AddInputNode("in1", u"a"));
  assert(!graph.AddOutputNode("out1", u"o1"));
  assert(!graph.AddEdge("e1", "in1", "out1"));
  assert(!graph.RemoveNode("out1"));
  assert(graph.Edges().empty());
}

void TestOutputOrder() {
  TransformationGraph graph;
  assert(!graph.AddInputNode("in1", u"a"));
  assert(!graph.AddOutputNode("out1", u"o1"));
  assert(!graph.AddOutputNode("out2", u"o2"));
  assert(!graph.AddEdge("e1", "in1", "out1"));
  assert(!graph.AddEdge("e2", "in1", "out2"));
  assert(!graph.SetOutputOrder({"out2", "out1"}));
  assert(graph.OutputOrder()[0] == "out2");
}

} // namespace csvmapper
